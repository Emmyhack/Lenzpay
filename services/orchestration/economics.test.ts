import test from 'node:test';
import assert from 'node:assert/strict';

import { policyFor } from '@/constants/config';
import { planPayment } from './planner';
import { collectionCost, minimumViableLeg, nettingSaving, planCollectionCost } from './costs';
import { CollectionQueue, runCollectionSweep } from './collections';
import {
  RailRegistry,
  createMockRail,
  type MockRailConfig,
} from './rails';
import { FIXED_NOW, feed, ngnBank, usdAccount } from './__fixtures__';
import type { FundingLeg } from '@/types/orchestration';

/**
 * The economics of moving money — the constraint that decides whether a
 * waterfall is a feature or a loss.
 */

const at = { now: FIXED_NOW };

// ---------------------------------------------------------------------------
// Rail cost model
// ---------------------------------------------------------------------------

test('a bank debit costs a flat fee on small amounts and a capped rate on large', () => {
  const bank = ngnBank(1_000_000, { id: 'b' });

  assert.equal(collectionCost(bank, 4_500), 55, 'flat band');
  assert.equal(collectionCost(bank, 100_000), 1_000, 'rate band, at the cap');
  assert.equal(collectionCost(bank, 50_000), 500, 'rate band, under the cap');
});

test('wallet rails undercut bank direct debit', () => {
  const bank = ngnBank(100_000, { id: 'b' });
  const wallet = ngnBank(100_000, { id: 'w', type: 'wallet' });

  assert.ok(collectionCost(wallet, 4_500) < collectionCost(bank, 4_500));
});

test('the viable-leg floor is a multiple of what the debit costs', () => {
  const bank = ngnBank(100_000, { id: 'b' });
  // A ₦55 debit must move at least ₦110 at a 2x ratio.
  assert.equal(minimumViableLeg(bank, 2), 110);
});

// ---------------------------------------------------------------------------
// Cost-aware planning
// ---------------------------------------------------------------------------

test('a plan reports what it will cost to collect, not just to convert', () => {
  const result = planPayment(
    [ngnBank(3_000, { id: 'a' }), ngnBank(5_000, { id: 'b' })],
    7_000,
    'NGN',
    feed(),
    { ...at, maxLegs: 2 }
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.plan.legs.length, 2);
  // Two bank debits at ₦55 each — money Lenz spends, distinct from totalFees,
  // which is what the user pays to convert.
  assert.equal(result.plan.collectionCost, 110);
  assert.equal(result.plan.totalFees, 0);
});

test('a leg that would cost more to collect than it contributes is dropped', () => {
  // The second account can only add ₦40 — less than the ₦55 it costs to debit.
  const result = planPayment(
    [ngnBank(20_000, { id: 'big' }), ngnBank(40, { id: 'dust' })],
    15_000,
    'NGN',
    feed(),
    { ...at, maxLegs: 2 }
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.legs.length, 1, 'the dust account is not worth a debit');
  assert.equal(result.plan.legs[0].source.id, 'big');
});

test('an uneconomic account is still used when it is the only way to cover the payment', () => {
  // Product promise beats cost optimisation: ₦40 is uneconomic to debit, but
  // without it the payment cannot complete at all.
  const result = planPayment(
    [ngnBank(3_000, { id: 'a' }), ngnBank(40, { id: 'dust' })],
    3_040,
    'NGN',
    feed(),
    { ...at, maxLegs: 2 }
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.legs.length, 2);
  assert.equal(
    result.plan.legs.reduce((sum, leg) => sum + leg.amountInSettlementCurrency, 0),
    3_040
  );
});

test('collection cost scales with leg count — the reason the cap is low', () => {
  const legs = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      source: ngnBank(10_000, { id: `s${i}` }),
      amountInSettlementCurrency: 1_500,
    }));

  assert.equal(planCollectionCost(legs(1)), 55);
  assert.equal(planCollectionCost(legs(2)), 110);
  assert.equal(planCollectionCost(legs(4)), 220, 'a 4-leg split costs 4x to fund');
});

// ---------------------------------------------------------------------------
// Netted collection
// ---------------------------------------------------------------------------

function leg(sourceId: string, amount: number): FundingLeg {
  const source = ngnBank(1_000_000, { id: sourceId });
  return {
    id: `leg_${sourceId}_${amount}_${Math.random()}`,
    sourceId,
    source,
    amountInSourceCurrency: amount,
    sourceCurrency: 'NGN',
    amountInSettlementCurrency: amount,
    settlementCurrency: 'NGN',
    feeInSettlementCurrency: 0,
    quote: {
      id: 'q',
      from: 'NGN',
      to: 'NGN',
      rate: 1,
      feeRate: 0,
      flatFee: 0,
      provider: 'none',
      quotedAt: FIXED_NOW,
      expiresAt: Number.POSITIVE_INFINITY,
    },
    status: 'planned',
  };
}

function railRegistry(config: Partial<MockRailConfig> = {}) {
  const rail = createMockRail({ id: 'bank', supportsNativeHold: false, latencyMs: 0, ...config });
  return new RailRegistry().registerType('bank', rail).registerType('wallet', rail);
}

test('many payments from one account collapse into a single debit', async () => {
  const queue = new CollectionQueue();

  // Five payments across two accounts — ten debits if collected inline.
  for (let i = 0; i < 5; i += 1) {
    queue.enqueue({ transactionId: `txn_${i}`, userId: 'u1', leg: leg('acct_a', 1_000), now: FIXED_NOW });
    queue.enqueue({ transactionId: `txn_${i}`, userId: 'u1', leg: leg('acct_b', 500), now: FIXED_NOW });
  }

  const batches = queue.buildBatches();
  assert.equal(batches.length, 2, 'one batch per account, not per payment');
  assert.equal(batches[0].totalInSourceCurrency, 5_000);
  assert.equal(batches[1].totalInSourceCurrency, 2_500);

  const report = await runCollectionSweep({ queue, rails: railRegistry() });

  assert.equal(report.debitsIssued, 2);
  assert.equal(report.debitsAvoided, 8, 'ten debits became two');
  assert.equal(report.itemsCollected, 10);
  assert.equal(queue.pending().length, 0);
});

test('netting saves real money, and the saving grows with activity', () => {
  const perDebit = 55;
  assert.equal(nettingSaving(5, 1, perDebit), 220);
  assert.equal(nettingSaving(20, 1, perDebit), 1_045);
  assert.equal(nettingSaving(1, 1, perDebit), 0, 'nothing to net on a single debit');
});

test("different users' debts are never netted together", async () => {
  const queue = new CollectionQueue();
  queue.enqueue({ transactionId: 't1', userId: 'u1', leg: leg('shared_bank', 1_000), now: FIXED_NOW });
  queue.enqueue({ transactionId: 't2', userId: 'u2', leg: leg('shared_bank', 1_000), now: FIXED_NOW });

  const batches = queue.buildBatches();
  assert.equal(batches.length, 2, 'same account id, different owners — must stay separate');
});

test('a failed sweep leaves items pending so the next sweep retries them', async () => {
  const queue = new CollectionQueue();
  queue.enqueue({ transactionId: 't1', userId: 'u1', leg: leg('acct_a', 1_000), now: FIXED_NOW });
  queue.enqueue({ transactionId: 't2', userId: 'u1', leg: leg('acct_a', 2_000), now: FIXED_NOW });

  const report = await runCollectionSweep({
    queue,
    rails: railRegistry({ failCaptureFor: new Set(['acct_a']) }),
    retryLimit: 3,
  });

  assert.equal(report.itemsFailed, 2);
  assert.equal(report.itemsCollected, 0);
  assert.equal(queue.pending().length, 2, 'still owed, still queued');
});

test('items escalate for manual recovery once retries are exhausted', async () => {
  const queue = new CollectionQueue();
  queue.enqueue({ transactionId: 't1', userId: 'u1', leg: leg('acct_a', 1_000), now: FIXED_NOW });

  const rails = railRegistry({ failCaptureFor: new Set(['acct_a']) });
  for (let i = 0; i < 3; i += 1) {
    await runCollectionSweep({ queue, rails, retryLimit: 3 });
  }

  assert.equal(queue.pending().length, 0, 'no longer retried automatically');
  assert.equal(queue.all().filter((item) => item.status === 'escalated').length, 1);
});

test('a sweep can be scoped to one user', async () => {
  const queue = new CollectionQueue();
  queue.enqueue({ transactionId: 't1', userId: 'u1', leg: leg('a', 1_000), now: FIXED_NOW });
  queue.enqueue({ transactionId: 't2', userId: 'u2', leg: leg('b', 1_000), now: FIXED_NOW });

  await runCollectionSweep({ queue, rails: railRegistry() }, 'u1');

  assert.equal(queue.pending('u1').length, 0);
  assert.equal(queue.pending('u2').length, 1, "another user's debt is untouched");
});

// ---------------------------------------------------------------------------
// Licensing phase gating
// ---------------------------------------------------------------------------

test('partner_tsp forbids float, netting and Smart Split', () => {
  const policy = policyFor('partner_tsp');

  assert.equal(policy.floatEnabled, false, 'no float means no credit exposure, no licence');
  assert.equal(policy.maxWaterfallLegs, 1, 'single-source only');
  assert.equal(policy.smartSplitEnabled, false);
  assert.equal(policy.nettedCollection, false, 'netting needs a float to net against');
  assert.equal(policy.floatOwner, 'partner_psp');
});

test('partner_float unlocks the split and netting together', () => {
  const policy = policyFor('partner_float');

  assert.equal(policy.floatEnabled, true);
  assert.equal(policy.smartSplitEnabled, true);
  assert.equal(policy.nettedCollection, true);
  assert.equal(policy.maxWaterfallLegs, 2, 'each extra leg is another fixed fee');
  assert.equal(policy.floatOwner, 'partner_psp', 'float is legally the partner’s');
});

test('own_licence moves the float onto our own books', () => {
  const policy = policyFor('own_licence');

  assert.equal(policy.floatOwner, 'lenz');
  assert.ok(policy.maxWaterfallLegs > policyFor('partner_float').maxWaterfallLegs);
});

test('no phase enables netting without a float to net against', () => {
  for (const phase of ['partner_tsp', 'partner_float', 'own_licence'] as const) {
    const policy = policyFor(phase);
    if (policy.nettedCollection) {
      assert.equal(policy.floatEnabled, true, `${phase} nets without a float`);
    }
  }
});

test('single-source planning works under the partner_tsp leg cap', () => {
  const result = planPayment(
    [ngnBank(50_000, { id: 'a' }), usdAccount(500, { id: 'b' })],
    4_500,
    'NGN',
    feed(),
    { ...at, maxLegs: policyFor('partner_tsp').maxWaterfallLegs }
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.kind, 'single_source');
  assert.equal(result.plan.legs.length, 1);
});

test('a payment needing two sources is refused under partner_tsp, not half-executed', () => {
  const result = planPayment(
    [ngnBank(3_000, { id: 'a' }), ngnBank(2_500, { id: 'b' })],
    4_500,
    'NGN',
    feed(),
    { ...at, maxLegs: policyFor('partner_tsp').maxWaterfallLegs }
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(
    result.reason,
    'exceeds_leg_limit',
    'the money exists — we just are not licensed to assemble it yet'
  );
  assert.equal(result.shortfall, 0);
});
