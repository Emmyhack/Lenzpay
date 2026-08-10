import test from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutionResult, FundingPlan } from '@/types/orchestration';
import { chooseStrategy, executePlan, type ExecutorDeps } from './executor';
import { Treasury, collectionConfidence } from './treasury';
import { planPayment } from './planner';
import { Ledger } from './ledger';
import { IdempotencyStore } from './idempotency';
import {
  RailRegistry,
  createMockRail,
  createMockSettlementRail,
  type MockRailConfig,
  type SettlementRail,
} from './rails';
import { FIXED_NOW, feed, ngnBank, payee, usdAccount } from './__fixtures__';

/**
 * Float-fronted settlement — the strategy the Nigerian launch corridor
 * actually runs on, because bank rails have no authorise-then-capture step.
 */

const USER = 'usr_test';
const KEY = 'idem_float';

/**
 * Bank rails as they really behave: a debit is a debit, there is no hold.
 * `supportsNativeHold: false` is what drives strategy selection.
 */
function harness(
  options: {
    railConfig?: Partial<MockRailConfig>;
    settlementRail?: SettlementRail;
    treasury?: Treasury;
  } = {}
) {
  const rail = createMockRail({
    id: 'ng_bank',
    supportsNativeHold: false,
    latencyMs: 0,
    ...options.railConfig,
  });

  const rails = new RailRegistry()
    .registerType('bank', rail)
    .registerType('wallet', rail)
    .registerType('usd', rail)
    .registerType('crypto', rail);

  const deps: ExecutorDeps = {
    rails,
    settlementRail: options.settlementRail ?? createMockSettlementRail(),
    ledger: new Ledger(),
    feed: feed(),
    idempotency: new IdempotencyStore<ExecutionResult>(),
    treasury: options.treasury ?? new Treasury(),
    now: () => FIXED_NOW,
  };

  return { deps, rails };
}

function plan(sources: Parameters<typeof planPayment>[0], amount: number): FundingPlan {
  const result = planPayment(sources, amount, 'NGN', feed(), { now: FIXED_NOW });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

/** Sources whose balances were verified just now, so confidence stays high. */
function freshBank(amount: number, id: string) {
  return ngnBank(amount, { id, reliability: 0.99, lastSynced: new Date(FIXED_NOW) });
}

// ---------------------------------------------------------------------------
// Strategy selection
// ---------------------------------------------------------------------------

test('rails without a real hold select float-fronted settlement', () => {
  const { rails } = harness();
  const p = plan([freshBank(50_000, 'src_a')], 4_500);
  assert.equal(chooseStrategy(p, rails), 'float_fronted');
});

test('rails that can authorise select hold-then-capture', () => {
  const { rails } = harness({ railConfig: { supportsNativeHold: true } });
  const p = plan([freshBank(50_000, 'src_a')], 4_500);
  assert.equal(chooseStrategy(p, rails), 'hold_then_capture');
});

test('one non-holding leg is enough to drop the whole plan to float-fronted', () => {
  const holding = createMockRail({ id: 'card', supportsNativeHold: true, latencyMs: 0 });
  const pushOnly = createMockRail({ id: 'bank', supportsNativeHold: false, latencyMs: 0 });
  const rails = new RailRegistry()
    .registerType('usd', holding)
    .registerType('bank', pushOnly);

  // ₦3,000 + $6 (≈₦9,166 net) — neither covers ₦10,000 alone, so both legs run.
  const p = plan(
    [usdAccount(6, { id: 'src_usd' }), freshBank(3_000, 'src_ngn')],
    10_000
  );
  assert.equal(p.legs.length, 2);
  assert.equal(chooseStrategy(p, rails), 'float_fronted');
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('the payee is paid once, then every account is collected', async () => {
  const { deps } = harness();
  const p = plan([freshBank(3_000, 'src_a'), freshBank(2_500, 'src_b')], 4_500);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.strategy, 'float_fronted');
  assert.equal(result.uncollectedLegs, undefined);
  assert.equal(deps.ledger.reconciles(result.transactionId), true);

  // Exactly one credit to the payee, regardless of how many accounts funded it.
  const payeeEntries = deps.ledger
    .forTransaction(result.transactionId)
    .filter((entry) => entry.account === 'payee_settlement');
  assert.equal(payeeEntries.length, 1, 'the payee sees one indivisible payment');
  assert.equal(payeeEntries[0].amount, 4_500);

  assert.equal(deps.treasury.outstandingFor(USER), 0, 'fully collected');
});

test('a cross-currency float-fronted payment still reconciles per currency', async () => {
  const { deps } = harness();
  const p = plan([usdAccount(500, { id: 'src_usd' })], 100_000);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const net = deps.ledger.netByCurrency(result.transactionId);
  assert.equal(net.NGN, 0);
  assert.equal(net.USD, 0);
});

// ---------------------------------------------------------------------------
// The point of the whole design
// ---------------------------------------------------------------------------

test('a collection failure does not fail the payment — the payee keeps their money', async () => {
  const { deps } = harness({ railConfig: { failCaptureFor: new Set(['src_b']) } });
  const p = plan([freshBank(3_000, 'src_a'), freshBank(2_500, 'src_b')], 4_500);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, true, 'the payment succeeded — the payee was paid');
  if (!result.ok) return;

  assert.equal(result.uncollectedLegs?.length, 1);
  assert.equal(result.uncollectedLegs?.[0].sourceId, 'src_b');

  // The shortfall is Lenz's exposure, tracked and recoverable.
  const outstanding = deps.treasury.outstandingFor(USER);
  assert.equal(outstanding, 1_500, 'the uncollected leg remains owed to the float');
});

test('a payout failure touches none of the user’s accounts', async () => {
  const { deps } = harness({
    settlementRail: createMockSettlementRail({ fail: true, reason: 'Payee bank unreachable' }),
  });
  const p = plan([freshBank(3_000, 'src_a'), freshBank(2_500, 'src_b')], 4_500);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.stage, 'settlement');
  assert.equal(result.fullyRolledBack, true);
  assert.equal(deps.ledger.all().length, 0, 'nothing booked');
  assert.equal(deps.treasury.outstandingFor(USER), 0, 'no exposure opened');
});

// ---------------------------------------------------------------------------
// Exposure limits
// ---------------------------------------------------------------------------

test('a payment above the per-transaction float limit is refused, not attempted', async () => {
  const treasury = new Treasury({ perTransactionNGN: 10_000 });
  const { deps } = harness({ treasury });
  const p = plan([freshBank(50_000, 'src_a'), freshBank(50_000, 'src_b')], 60_000);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'float_refused');
  assert.equal(result.fullyRolledBack, true);
  assert.equal(deps.ledger.all().length, 0);
});

test('outstanding exposure accumulates per user and eventually blocks new payments', async () => {
  const treasury = new Treasury({ perUserOutstandingNGN: 5_000 });
  const { deps } = harness({
    treasury,
    railConfig: { failCaptureFor: new Set(['src_a', 'src_b']) },
  });

  // First payment succeeds but collects nothing, leaving ₦4,500 outstanding.
  const first = plan([freshBank(3_000, 'src_a'), freshBank(2_500, 'src_b')], 4_500);
  await executePlan(
    { plan: first, payee: payee(), idempotencyKey: 'k1', userId: USER },
    deps
  );
  assert.equal(treasury.outstandingFor(USER), 4_500);

  // A second payment would push the user past their limit.
  const second = plan([freshBank(3_000, 'src_a'), freshBank(2_500, 'src_b')], 4_500);
  const result = await executePlan(
    { plan: second, payee: payee(), idempotencyKey: 'k2', userId: USER },
    deps
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'float_refused');
  assert.match(result.reason, /still settling/);
});

test('a single-leg plan falls back to direct debit when the float refuses', async () => {
  const treasury = new Treasury({ floatEnabled: false });
  const { deps } = harness({ treasury });
  const p = plan([freshBank(50_000, 'src_a')], 4_500);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  // One account means no partial-charge risk, so debit-then-settle is safe.
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.strategy, 'hold_then_capture');
});

test('a multi-leg plan refuses rather than debit several accounts without protection', async () => {
  const treasury = new Treasury({ floatEnabled: false });
  const { deps } = harness({ treasury });
  const p = plan([freshBank(3_000, 'src_a'), freshBank(2_500, 'src_b')], 4_500);

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'float_refused');
  assert.equal(
    deps.ledger.all().length,
    0,
    'refusing beats charging three accounts with no way to unwind'
  );
});

// ---------------------------------------------------------------------------
// Collection confidence
// ---------------------------------------------------------------------------

test('confidence multiplies across legs, so one weak account drags the plan down', () => {
  const strong = plan([freshBank(5_000, 'src_a')], 4_500);
  const weak = plan(
    [
      ngnBank(3_000, { id: 'src_a', reliability: 0.99, lastSynced: new Date(FIXED_NOW) }),
      ngnBank(2_500, { id: 'src_b', reliability: 0.6, lastSynced: new Date(FIXED_NOW) }),
    ],
    4_500
  );

  const strongScore = collectionConfidence(strong, FIXED_NOW);
  const weakScore = collectionConfidence(weak, FIXED_NOW);

  assert.ok(strongScore > 0.98);
  assert.ok(weakScore < 0.61, `expected the 0.6 leg to dominate, got ${weakScore}`);
});

test('a stale balance lowers confidence without zeroing it', () => {
  const stale = plan(
    [
      ngnBank(5_000, {
        id: 'src_a',
        reliability: 0.99,
        lastSynced: new Date(FIXED_NOW - 60 * 60_000), // an hour old
      }),
    ],
    4_500
  );

  const score = collectionConfidence(stale, FIXED_NOW);
  assert.ok(score < 0.99, 'staleness costs something');
  assert.ok(score > 0.8, 'but a stale balance is still evidence');
});

test('confidence below the floor blocks the float', async () => {
  const treasury = new Treasury({ minCollectionConfidence: 0.95 });
  const { deps } = harness({ treasury });
  const p = plan(
    [
      ngnBank(3_000, { id: 'src_a', reliability: 0.5, lastSynced: new Date(FIXED_NOW) }),
      ngnBank(2_500, { id: 'src_b', reliability: 0.5, lastSynced: new Date(FIXED_NOW) }),
    ],
    4_500
  );

  const result = await executePlan(
    { plan: p, payee: payee(), idempotencyKey: KEY, userId: USER },
    deps
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /re-check/i);
});

test('repeated collection failures escalate for manual recovery', () => {
  const treasury = new Treasury({ collectionRetryLimit: 3 });
  treasury.open({
    transactionId: 'txn_1',
    userId: USER,
    amount: 4_500,
    currency: 'NGN',
    now: FIXED_NOW,
  });

  treasury.recordFailedCollection('txn_1');
  treasury.recordFailedCollection('txn_1');
  assert.equal(treasury.escalated().length, 0);

  treasury.recordFailedCollection('txn_1');
  assert.equal(treasury.escalated().length, 1);
  assert.equal(treasury.escalated()[0].transactionId, 'txn_1');
});
