import test from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutionResult, FundingPlan, LockedPlan } from '@/types/orchestration';
import type { PaymentSource } from '@/types/payment';
import {
  floatExposureOf,
  lockedPlanExpired,
  preparePlan,
  releaseLockedPlan,
  toFundingPlan,
  type BalanceProvider,
  type PrepareDeps,
} from './prepare';
import { executePlan, strategyForLocked, type ExecutorDeps } from './executor';
import { CapabilityRegistry } from './capabilities';
import { planPayment } from './planner';
import { Treasury } from './treasury';
import { Ledger } from './ledger';
import { IdempotencyStore } from './idempotency';
import {
  RailRegistry,
  createMockRail,
  createMockSettlementRail,
  type RailAdapter,
} from './rails';
import {
  FIXED_NOW,
  card,
  custodyAccount,
  cryptoWallet,
  feed,
  ngnBank,
  payee,
} from './__fixtures__';

/**
 * `prepare()` — the stage that turns an estimate into a commitment.
 *
 * The property under test throughout is the one the three-verb split exists to
 * protect: planning touches nothing, preparing touches only what it can undo,
 * and a prepare that fails leaves no money held anywhere.
 */

const USER = 'usr_prep';
const KEY = 'idem_prep';

interface HarnessOptions {
  failHoldFor?: Set<string>;
  treasury?: Treasury;
  balances?: BalanceProvider;
  capabilities?: CapabilityRegistry;
}

/** Counts every rail call, so "no side effects" can be asserted rather than assumed. */
function countingRail(id: string, failHoldFor?: Set<string>) {
  const calls = { hold: 0, capture: 0, release: 0 };
  const inner = createMockRail({ id, latencyMs: 0, failHoldFor });

  const rail: RailAdapter = {
    id: inner.id,
    supportsNativeHold: inner.supportsNativeHold,
    async hold(request) {
      calls.hold += 1;
      return inner.hold(request);
    },
    async capture(request) {
      calls.capture += 1;
      return inner.capture(request);
    },
    async release(request) {
      calls.release += 1;
      return inner.release(request);
    },
  };

  return { rail, calls };
}

function harness(options: HarnessOptions = {}) {
  const { rail, calls } = countingRail('rail', options.failHoldFor);

  const rails = new RailRegistry()
    .registerType('bank', rail)
    .registerType('wallet', rail)
    .registerType('usd', rail)
    .registerType('custody', rail)
    .registerType('card', rail)
    .registerType('crypto', rail);

  const deps: PrepareDeps = {
    rails,
    feed: feed(),
    treasury: options.treasury ?? new Treasury(),
    capabilities: options.capabilities ?? new CapabilityRegistry(),
    balances: options.balances,
    now: () => FIXED_NOW,
  };

  return { deps, rails, calls };
}

function plan(sources: PaymentSource[], amount: number): FundingPlan {
  const result = planPayment(sources, amount, 'NGN', feed(), { now: FIXED_NOW });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

async function prepared(sources: PaymentSource[], amount: number, options: HarnessOptions = {}) {
  const { deps, calls } = harness(options);
  const result = await preparePlan(
    { plan: plan(sources, amount), userId: USER, idempotencyKey: KEY },
    deps
  );
  return { result, calls, deps };
}

/** Balances that answer whatever the test says they should. */
function balanceProvider(readings: Record<string, number>): BalanceProvider {
  return {
    async read(source) {
      const balance = readings[source.id];
      if (balance === undefined) return { ok: false, reason: 'no reading' };
      return { ok: true, balance, observedAt: FIXED_NOW };
    },
  };
}

// ---------------------------------------------------------------------------
// plan() stays pure
// ---------------------------------------------------------------------------

test('planning places no authorisations, however capable the rails are', () => {
  const { calls } = harness();
  plan([card(200_000), custodyAccount(200_000)], 50_000);

  assert.equal(calls.hold, 0, 'plan() runs on every keystroke — it must touch nothing');
  assert.equal(calls.capture, 0);
});

// ---------------------------------------------------------------------------
// Per-leg guarantees
// ---------------------------------------------------------------------------

test('a card leg is genuinely authorised, not merely expected to pay', async () => {
  const { result, calls } = await prepared([card(200_000)], 50_000);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const [leg] = result.locked.legs;
  assert.equal(leg.guarantee, 'PREAUTHORIZED');
  assert.ok(leg.authorizationRef, 'a real hold reference exists');
  assert.equal(leg.status, 'held');
  assert.equal(calls.hold, 1);
  assert.equal(result.locked.requiresFloat, false);
});

test('a custody leg is ring-fenced in an account we control', async () => {
  const { result } = await prepared([custodyAccount(200_000)], 50_000);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.locked.legs[0].guarantee, 'RESERVED');
  assert.equal(result.locked.requiresFloat, false);
});

test('a bank leg is verified but unlockable, so the float carries it', async () => {
  const { result, calls } = await prepared([ngnBank(200_000)], 50_000);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const [leg] = result.locked.legs;
  assert.equal(leg.guarantee, 'FLOAT_BACKED');
  assert.equal(leg.authorizationRef, undefined);
  assert.equal(calls.hold, 0, 'there is nothing to hold on a direct-debit rail');
  assert.equal(result.locked.requiresFloat, true);
  assert.ok(leg.verifiedBalance !== null, 'the balance is still recorded');
});

test('a locked plan reports its weakest leg, not its strongest', async () => {
  // ₦40,000 needs both: the card covers part, the bank the rest.
  const { result } = await prepared(
    [card(30_000, { id: 'src_card' }), ngnBank(30_000, { id: 'src_bank' })],
    40_000
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.locked.legs.length, 2);
  assert.equal(result.locked.weakestGuarantee, 'FLOAT_BACKED');
  assert.equal(result.locked.requiresFloat, true);
});

// ---------------------------------------------------------------------------
// Balance verification
// ---------------------------------------------------------------------------

test('a balance that moved between planning and confirming is caught', async () => {
  const source = ngnBank(200_000, { id: 'src_moved' });
  // Planned against ₦200,000; the user emptied the account in the meantime.
  const { result } = await prepared([source], 50_000, {
    balances: balanceProvider({ src_moved: 1_000 }),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.reason, 'balance_moved');
  assert.equal(result.fullyRolledBack, true);
});

test('a sufficiency check commits a leg without disclosing the balance', async () => {
  const source = ngnBank(200_000, {
    id: 'src_suff',
    capabilities: { balanceVisibility: 'sufficiency_only' },
  });

  const provider: BalanceProvider = {
    async read() {
      throw new Error('read() must not be called when sufficiency is available');
    },
    async sufficient() {
      return { ok: true, sufficient: true, observedAt: FIXED_NOW };
    },
  };

  const { result } = await prepared([source], 50_000, { balances: provider });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const [leg] = result.locked.legs;
  assert.equal(leg.verifiedAt, FIXED_NOW);
  assert.equal(
    leg.verifiedBalance,
    null,
    'the provider confirmed sufficiency without disclosing a figure — inventing one would misstate what we know'
  );
});

test('a sufficiency check that says no fails the prepare', async () => {
  const source = ngnBank(200_000, {
    id: 'src_no',
    capabilities: { balanceVisibility: 'sufficiency_only' },
  });

  const provider: BalanceProvider = {
    async read() {
      return { ok: false, reason: 'unused' };
    },
    async sufficient() {
      return { ok: true, sufficient: false, observedAt: FIXED_NOW };
    },
  };

  const { result } = await prepared([source], 50_000, { balances: provider });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'balance_moved');
});

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

test('a declined card releases every authorisation already placed', async () => {
  const custody = custodyAccount(30_000, { id: 'src_custody' });
  const declined = card(30_000, { id: 'src_card' });

  const { result, calls } = await prepared([custody, declined], 40_000, {
    failHoldFor: new Set(['src_card']),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.reason, 'authorization_declined');
  assert.equal(result.fullyRolledBack, true);
  assert.equal(calls.release, 1, 'the custody reserve was given back');
  assert.equal(
    result.releasedLegs.every((leg) => leg.status === 'released'),
    true
  );
});

test('a float refusal releases the legs that were already authorised', async () => {
  // A treasury that will not front anything.
  const treasury = new Treasury({ floatEnabled: false });

  const { result, calls } = await prepared(
    [custodyAccount(30_000, { id: 'src_custody' }), ngnBank(30_000, { id: 'src_bank' })],
    40_000,
    { treasury }
  );

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.reason, 'float_refused');
  assert.equal(calls.release, 1, 'the custody reserve must not be stranded');
  assert.equal(result.fullyRolledBack, true);
});

test('a fully guaranteed plan never consults the float at all', async () => {
  const treasury = new Treasury({ floatEnabled: false });
  const { result } = await prepared([custodyAccount(200_000)], 50_000, { treasury });

  assert.equal(
    result.ok,
    true,
    'nothing is unprotected, so a disabled float is irrelevant'
  );
});

// ---------------------------------------------------------------------------
// Crypto and delegated spend
// ---------------------------------------------------------------------------

test('an external wallet asks for a signature rather than failing the payment', async () => {
  const { result } = await prepared([cryptoWallet('USDT', 500, { id: 'src_ext' })], 50_000);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.reason, 'signature_required');
  assert.match(result.message, /approve/i);
});

test('a standing allowance lets an embedded wallet contribute without interrupting', async () => {
  const embedded = cryptoWallet('USDT', 500, {
    id: 'src_embedded',
    capabilities: { requiresUserSignature: false, delegatedSpend: true, delegatedLimit: 500 },
  });

  const { result } = await prepared([embedded], 50_000);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.locked.legs[0].guarantee, 'SIGNED');
});

test('a payment above the approved allowance needs the user again', async () => {
  const embedded = cryptoWallet('USDT', 500, {
    id: 'src_capped',
    capabilities: { requiresUserSignature: false, delegatedSpend: true, delegatedLimit: 1 },
  });

  const { result } = await prepared([embedded], 50_000);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'signature_required');
  assert.match(result.message, /limit/i);
});

// ---------------------------------------------------------------------------
// Float exposure accounting
// ---------------------------------------------------------------------------

test('only unprotected legs consume float exposure', async () => {
  const { result } = await prepared(
    [card(30_000, { id: 'src_card' }), ngnBank(30_000, { id: 'src_bank' })],
    40_000
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const exposure = floatExposureOf(result.locked);
  const bankLeg = result.locked.legs.find((leg) => leg.source.id === 'src_bank');

  assert.ok(bankLeg);
  assert.equal(exposure, bankLeg.amountInSettlementCurrency);
  assert.ok(
    exposure < result.locked.amount,
    'charging the treasury for the authorised card leg would waste headroom on a risk that is not there'
  );
});

// ---------------------------------------------------------------------------
// The locked plan is what executes
// ---------------------------------------------------------------------------

test('strategy is read off the guarantees, not guessed from the rails', async () => {
  const guaranteed = await prepared([custodyAccount(200_000)], 50_000);
  assert.equal(guaranteed.result.ok, true);
  if (!guaranteed.result.ok) return;
  assert.equal(strategyForLocked(guaranteed.result.locked), 'hold_then_capture');

  const exposed = await prepared([ngnBank(200_000)], 50_000);
  assert.equal(exposed.result.ok, true);
  if (!exposed.result.ok) return;
  assert.equal(strategyForLocked(exposed.result.locked), 'float_fronted');
});

test('an on-chain leg keeps the plan on the float, because it cannot be released', async () => {
  const embedded = cryptoWallet('USDT', 500, {
    id: 'src_signed',
    capabilities: { requiresUserSignature: false, delegatedSpend: true, delegatedLimit: 500 },
  });

  const { result } = await prepared([embedded], 50_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(
    strategyForLocked(result.locked),
    'float_fronted',
    'a broadcast transfer cannot be rolled back, so atomicity still needs the float'
  );
});

test('executing a locked plan does not re-authorise what prepare already held', async () => {
  const { deps, rails, calls } = harness();
  const source = custodyAccount(200_000);

  const preparation = await preparePlan(
    { plan: plan([source], 50_000), userId: USER, idempotencyKey: KEY },
    deps
  );
  assert.equal(preparation.ok, true);
  if (!preparation.ok) return;

  const holdsAfterPrepare = calls.hold;
  assert.equal(holdsAfterPrepare, 1);

  const executorDeps: ExecutorDeps = {
    rails,
    settlementRail: createMockSettlementRail(),
    ledger: new Ledger(),
    feed: feed(),
    idempotency: new IdempotencyStore<ExecutionResult>(),
    treasury: new Treasury(),
    now: () => FIXED_NOW,
  };

  const execution = await executePlan(
    {
      plan: toFundingPlan(preparation.locked),
      payee: payee(),
      idempotencyKey: KEY,
      userId: USER,
      strategy: strategyForLocked(preparation.locked),
    },
    executorDeps
  );

  assert.equal(execution.ok, true);
  assert.equal(
    calls.hold,
    holdsAfterPrepare,
    'a second authorisation would double-count the user’s available balance'
  );
  assert.equal(calls.capture, 1, 'the existing authorisation is captured');
});

test('a locked plan round-trips to a funding plan without losing its legs', async () => {
  const { result } = await prepared([ngnBank(200_000)], 50_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const back = toFundingPlan(result.locked);
  assert.equal(back.id, result.locked.planId);
  assert.equal(back.amount, result.locked.amount);
  assert.equal(back.legs.length, result.locked.legs.length);
  assert.equal(back.totalFees, result.locked.totalFees);
});

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

test('a locked plan expires at its earliest authorisation or rate lock', async () => {
  const { result } = await prepared([card(200_000)], 50_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const locked: LockedPlan = result.locked;
  assert.ok(locked.expiresAt !== null, 'a placed authorisation imposes a deadline');
  assert.equal(lockedPlanExpired(locked, locked.expiresAt! - 1), false);
  assert.equal(lockedPlanExpired(locked, locked.expiresAt!), true);
});

test('a same-currency plan with nothing held carries no deadline', async () => {
  const { result } = await prepared([ngnBank(200_000)], 50_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.locked.expiresAt, null);
  assert.equal(lockedPlanExpired(result.locked, FIXED_NOW + 1_000_000), false);
});

// ---------------------------------------------------------------------------
// Abandoning a prepared plan
// ---------------------------------------------------------------------------

test('cancelling a prepared payment gives the held funds back', async () => {
  const { deps, calls } = harness();
  const preparation = await preparePlan(
    { plan: plan([card(200_000)], 50_000), userId: USER, idempotencyKey: KEY },
    deps
  );
  assert.equal(preparation.ok, true);
  if (!preparation.ok) return;
  assert.equal(calls.hold, 1);

  const outcome = await releaseLockedPlan(preparation.locked, deps, KEY);

  assert.equal(outcome.released, 1);
  assert.equal(outcome.fullyReleased, true);
  assert.equal(calls.release, 1);
});

test('abandoning is idempotent, so an unmount handler may fire twice', async () => {
  const { deps } = harness();
  const preparation = await preparePlan(
    { plan: plan([card(200_000)], 50_000), userId: USER, idempotencyKey: KEY },
    deps
  );
  assert.equal(preparation.ok, true);
  if (!preparation.ok) return;

  await releaseLockedPlan(preparation.locked, deps, KEY);
  const second = await releaseLockedPlan(preparation.locked, deps, KEY);

  assert.equal(
    second.fullyReleased,
    true,
    'releasing an already-released authorisation is a success, not an error'
  );
});

test('a float-backed plan has nothing to give back', async () => {
  const { deps, calls } = harness();
  const preparation = await preparePlan(
    { plan: plan([ngnBank(200_000)], 50_000), userId: USER, idempotencyKey: KEY },
    deps
  );
  assert.equal(preparation.ok, true);
  if (!preparation.ok) return;

  const outcome = await releaseLockedPlan(preparation.locked, deps, KEY);

  assert.equal(outcome.released, 0);
  assert.equal(outcome.fullyReleased, true);
  assert.equal(calls.release, 0, 'there was never a hold to release');
});
