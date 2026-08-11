import test from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutionResult, FundingPlan } from '@/types/orchestration';
import { executePlan, type ExecutorDeps } from './executor';
import { Treasury } from './treasury';
import { planPayment } from './planner';
import { Ledger } from './ledger';
import { IdempotencyStore, deriveIdempotencyKey } from './idempotency';
import {
  RailRegistry,
  createMockRail,
  createMockSettlementRail,
  type MockRailConfig,
  type RailAdapter,
  type SettlementRail,
} from './rails';
import { FIXED_NOW, cryptoWallet, feed, ngnBank, payee, usdAccount } from './__fixtures__';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Records every rail verb so tests can assert on what actually happened. */
interface Journal {
  holds: string[];
  captures: string[];
  releases: string[];
  refunds: string[];
}

function spyRail(journal: Journal, config: MockRailConfig): RailAdapter {
  const inner = createMockRail(config);
  return {
    id: inner.id,
    supportsNativeHold: inner.supportsNativeHold,
    async hold(request) {
      const result = await inner.hold(request);
      if (result.ok) journal.holds.push(request.source.id);
      return result;
    },
    async capture(request) {
      const result = await inner.capture(request);
      if (result.ok) journal.captures.push(request.source.id);
      return result;
    },
    async release(request) {
      const result = await inner.release(request);
      if (result.ok) journal.releases.push(request.source.id);
      return result;
    },
    ...(inner.refund
      ? {
          async refund(request) {
            const result = await inner.refund!(request);
            if (result.ok) journal.refunds.push(request.source.id);
            return result;
          },
        }
      : {}),
  };
}

function harness(
  railConfig: MockRailConfig = { id: 'test_rail' },
  settlementRail: SettlementRail = createMockSettlementRail()
) {
  const journal: Journal = { holds: [], captures: [], releases: [], refunds: [] };
  const rail = spyRail(journal, railConfig);

  const rails = new RailRegistry()
    .registerType('bank', rail)
    .registerType('wallet', rail)
    .registerType('usd', rail)
    .registerType('crypto', rail);

  const deps: ExecutorDeps = {
    rails,
    settlementRail,
    ledger: new Ledger(),
    feed: feed(),
    idempotency: new IdempotencyStore<ExecutionResult>(),
    treasury: new Treasury(),
    now: () => FIXED_NOW,
  };

  return { deps, journal, rails };
}

// Tests pin `maxLegs` explicitly rather than inheriting the launch phase's
// cap — engine behaviour under N legs shouldn't change when a business policy
// like `LaunchPhase` is retuned.
function plan(
  sources: Parameters<typeof planPayment>[0],
  amount: number,
  maxLegs = 4
): FundingPlan {
  const result = planPayment(sources, amount, 'NGN', feed(), { now: FIXED_NOW, maxLegs });
  assert.equal(result.ok, true, 'fixture should produce a valid plan');
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

const KEY = 'idem_test_key';
const USER = 'usr_test';

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

test('a single-source payment settles and books a balanced ledger', async () => {
  const { deps, journal } = harness();
  const p = plan([ngnBank(50_000, { id: 'src_a' })], 4_500);

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.status, 'settled');
  assert.deepEqual(journal.holds, ['src_a']);
  assert.deepEqual(journal.captures, ['src_a']);
  assert.deepEqual(journal.releases, []);
  assert.equal(result.legs[0].status, 'captured');
  assert.equal(deps.ledger.reconciles(result.transactionId), true);
});

test('a waterfall holds every source before capturing any of them', async () => {
  const { deps, journal } = harness();
  const p = plan(
    [ngnBank(3_000, { id: 'src_a' }), ngnBank(2_500, { id: 'src_b' })],
    4_500
  );

  // Order matters: hold-then-capture means both holds land before any capture.
  const order: string[] = [];
  const rail = deps.rails.resolve(p.legs[0].source);
  const originalHold = rail.hold.bind(rail);
  const originalCapture = rail.capture.bind(rail);
  rail.hold = async (request) => {
    order.push(`hold:${request.source.id}`);
    return originalHold(request);
  };
  rail.capture = async (request) => {
    order.push(`capture:${request.source.id}`);
    return originalCapture(request);
  };

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, true);
  assert.deepEqual(order, [
    'hold:src_a',
    'hold:src_b',
    'capture:src_a',
    'capture:src_b',
  ]);
  assert.deepEqual(journal.captures, ['src_a', 'src_b']);
});

test('a cross-currency payment reconciles to the kobo in both currencies', async () => {
  const { deps } = harness();
  const p = plan([usdAccount(500, { id: 'src_usd' })], 100_000);

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const net = deps.ledger.netByCurrency(result.transactionId);
  assert.equal(net.USD, 0, 'USD side must balance');
  assert.equal(net.NGN, 0, 'NGN side must balance');
  assert.equal(deps.ledger.reconciles(result.transactionId), true);
});

test('a multi-currency waterfall reconciles across every currency it touches', async () => {
  const { deps } = harness();
  // ₦3,000 + $4 (≈₦6,150) + 30 USDT (≈₦46,000) ≈ ₦55,000 total, with no
  // single account able to cover ₦50,000 on its own.
  const p = plan(
    [
      ngnBank(3_000, { id: 'src_ngn' }),
      usdAccount(4, { id: 'src_usd' }),
      cryptoWallet('USDT', 30, { id: 'src_usdt' }),
    ],
    50_000,
    3
  );
  assert.equal(p.legs.length, 3, 'fixture should require all three currencies');

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const [currency, net] of Object.entries(deps.ledger.netByCurrency(result.transactionId))) {
    assert.equal(net, 0, `${currency} did not net to zero`);
  }
});

// ---------------------------------------------------------------------------
// The core guarantee: no money moves if any hold fails (§5.4, §5.7)
// ---------------------------------------------------------------------------

test('a failed hold releases every prior hold and captures nothing', async () => {
  const { deps, journal } = harness({
    id: 'test_rail',
    failHoldFor: new Set(['src_c']),
  });
  const p = plan(
    [
      ngnBank(2_000, { id: 'src_a' }),
      ngnBank(1_500, { id: 'src_b' }),
      ngnBank(1_500, { id: 'src_c' }),
    ],
    4_500,
    3
  );

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.stage, 'hold');
  assert.equal(result.status, 'failed');
  assert.equal(result.fullyRolledBack, true);
  assert.deepEqual(journal.captures, [], 'no account may be debited');
  assert.deepEqual(journal.releases, ['src_a', 'src_b'], 'prior holds are given back');
  assert.equal(deps.ledger.all().length, 0, 'nothing is booked');
});

test('a hold failure leaves the idempotency key free, so a retry is allowed', async () => {
  const { deps } = harness({ id: 'test_rail', failHoldFor: new Set(['src_a']) });
  const p = plan([ngnBank(50_000, { id: 'src_a' })], 4_500);

  await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);
  assert.equal(deps.idempotency.peek(KEY), undefined);
});

// ---------------------------------------------------------------------------
// Failure after money has moved (§5.7)
// ---------------------------------------------------------------------------

test('a failed capture refunds what was already captured and releases the rest', async () => {
  const { deps, journal } = harness({
    id: 'test_rail',
    failCaptureFor: new Set(['src_b']),
  });
  const p = plan([ngnBank(3_000, { id: 'src_a' }), ngnBank(2_500, { id: 'src_b' })], 4_500);

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.stage, 'capture');
  assert.deepEqual(journal.captures, ['src_a']);
  assert.deepEqual(journal.refunds, ['src_a'], 'the captured leg is given back');
  assert.equal(result.fullyRolledBack, true);
  assert.equal(result.status, 'failed');

  // The reversal is booked, and the transaction still nets to zero.
  assert.ok(deps.ledger.all().some((entry) => entry.reversalOf));
  assert.equal(deps.ledger.reconciles(result.transactionId), true);
});

test('a rail that cannot refund is reported as partially_reversed, never as a clean failure', async () => {
  const { deps } = harness({
    id: 'test_rail',
    failCaptureFor: new Set(['src_b']),
    supportsRefund: false,
  });
  const p = plan([ngnBank(3_000, { id: 'src_a' }), ngnBank(2_500, { id: 'src_b' })], 4_500);

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.status, 'partially_reversed');
  assert.equal(result.fullyRolledBack, false);
  assert.match(result.legs[0].failureReason ?? '', /cannot be refunded automatically/);
});

test('a payout failure refunds every captured leg', async () => {
  const { deps, journal } = harness(
    { id: 'test_rail' },
    createMockSettlementRail({ fail: true, reason: 'Payee bank unreachable' })
  );
  const p = plan([ngnBank(3_000, { id: 'src_a' }), ngnBank(2_500, { id: 'src_b' })], 4_500);

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.stage, 'settlement');
  assert.equal(result.reason, 'Payee bank unreachable');
  assert.deepEqual(journal.captures, ['src_a', 'src_b']);
  assert.deepEqual(journal.refunds, ['src_a', 'src_b']);
  assert.equal(result.fullyRolledBack, true);
  assert.equal(deps.ledger.reconciles(result.transactionId), true);
});

// ---------------------------------------------------------------------------
// Idempotency (§6.1)
// ---------------------------------------------------------------------------

test('replaying a completed key returns the original result without re-charging', async () => {
  const { deps, journal } = harness();
  const p = plan([ngnBank(50_000, { id: 'src_a' })], 4_500);

  const first = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);
  const second = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(first.ok, true);
  assert.equal(second, first, 'the stored result is replayed verbatim');
  assert.deepEqual(journal.captures, ['src_a'], 'exactly one debit across both calls');
});

test('a retried waterfall never double-charges any of its accounts', async () => {
  const { deps, journal } = harness();
  const p = plan(
    [
      ngnBank(2_000, { id: 'src_a' }),
      ngnBank(1_500, { id: 'src_b' }),
      ngnBank(1_500, { id: 'src_c' }),
    ],
    4_500,
    3
  );

  await Promise.all([
    executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps),
    executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps),
    executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps),
  ]);

  assert.deepEqual(
    journal.captures.slice().sort(),
    ['src_a', 'src_b', 'src_c'],
    'each account debited exactly once despite three concurrent attempts'
  );
});

test('changing the funding mix produces a different idempotency key', () => {
  const base = {
    userId: 'usr_1',
    payeeId: 'payee_1',
    amount: 4_500,
    currency: 'NGN' as const,
    attemptNonce: 'nonce_1',
  };
  const planA = plan([ngnBank(50_000, { id: 'src_a' })], 4_500);
  const planB = plan([ngnBank(50_000, { id: 'src_b' })], 4_500);

  assert.notEqual(
    deriveIdempotencyKey({ ...base, plan: planA }),
    deriveIdempotencyKey({ ...base, plan: planB })
  );
  assert.equal(
    deriveIdempotencyKey({ ...base, plan: planA }),
    deriveIdempotencyKey({ ...base, plan: planA }),
    'the same payment must derive the same key so retries dedupe'
  );
});

// ---------------------------------------------------------------------------
// Rate-lock expiry (§5.5)
// ---------------------------------------------------------------------------

test('an expired rate within tolerance re-quotes and settles silently', async () => {
  const { deps } = harness();
  const p = plan([usdAccount(500, { id: 'src_usd' })], 100_000);

  // Past the lock window, with a 0.2% move.
  deps.now = () => FIXED_NOW + 60_000;
  deps.feed = feed({ USD: 1_550 * 0.998 });

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.legs[0].amountInSettlementCurrency, 100_000, 'the payee still gets ₦100,000');
  assert.ok(
    result.legs[0].amountInSourceCurrency > p.legs[0].amountInSourceCurrency,
    'a weaker rate means more USD comes out'
  );
  assert.equal(deps.ledger.reconciles(result.transactionId), true);
});

test('an expired rate beyond tolerance stops before any money moves', async () => {
  const { deps, journal } = harness();
  const p = plan([usdAccount(500, { id: 'src_usd' })], 100_000);

  deps.now = () => FIXED_NOW + 60_000;
  deps.feed = feed({ USD: 1_550 * 0.95 }); // 5% move

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.stage, 'rate_expired');
  assert.equal(result.fullyRolledBack, true);
  assert.deepEqual(journal.holds, []);
  assert.deepEqual(journal.captures, []);
  assert.match(result.reason, /confirm again/i);
});

test('a re-quote that outruns the account balance fails cleanly', async () => {
  const { deps, journal } = harness();
  // $65.15 covers ₦100,000 at 1,550 with barely a cent to spare.
  const p = plan([usdAccount(65.15, { id: 'src_usd' })], 100_000);

  deps.now = () => FIXED_NOW + 60_000;
  deps.feed = feed({ USD: 1_550 * 0.9965 }); // inside tolerance, but enough to bite

  const result = await executePlan({ plan: p, payee: payee(), idempotencyKey: KEY, userId: USER, strategy: 'hold_then_capture' }, deps);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'rate_expired');
  assert.match(result.reason, /no longer covers/);
  assert.deepEqual(journal.captures, []);
});
