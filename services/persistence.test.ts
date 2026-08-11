import test from 'node:test';
import assert from 'node:assert/strict';

import {
  StorageKeys,
  createMemoryStore,
  decode,
  encode,
  read,
  remove,
  setStore,
  write,
} from './persistence';
import { CollectionQueue } from './orchestration/collections';
import { Treasury } from './orchestration/treasury';
import { IdempotencyStore } from './orchestration/idempotency';
import { evaluatePaymentRisk } from './fraud';
import { planPayment } from './orchestration/planner';
import { devRateFeed } from './orchestration/fx';
import { FIXED_NOW, ngnBank, payee as makePayee } from './orchestration/__fixtures__';
import type { FundingLeg } from '@/types/orchestration';

const feed = devRateFeed(FIXED_NOW);

/** A storage engine that outlives the objects reading it — i.e. a device. */
function device() {
  const disk = createMemoryStore();
  setStore(disk);
  return disk;
}

function leg(sourceId: string, amount: number): FundingLeg {
  const source = ngnBank(1_000_000, { id: sourceId });
  return {
    id: `leg_${sourceId}_${amount}`,
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

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

test('Dates survive a round trip as Dates, not strings', () => {
  const when = new Date('2026-03-04T05:06:07.000Z');
  const restored = decode<{ at: Date; nested: { at: Date } }>(
    encode({ at: when, nested: { at: when } })
  );

  assert.ok(restored.at instanceof Date, 'plain JSON would have left a string here');
  assert.equal(restored.at.getTime(), when.getTime());
  assert.ok(restored.nested.at instanceof Date, 'nested dates too');
});

test('a restored source can still be measured for staleness', () => {
  // The concrete bug this prevents: collection confidence calls
  // `lastSynced.getTime()`, which throws on a string.
  device();
  write('k', ngnBank(1_000, { id: 'a', lastSynced: new Date(FIXED_NOW) }));
  const restored = read<{ lastSynced: Date }>('k')!;

  assert.doesNotThrow(() => restored.lastSynced.getTime());
  assert.equal(restored.lastSynced.getTime(), FIXED_NOW);
});

test('corrupt stored data is dropped rather than crashing the launch', () => {
  const disk = device();
  disk.set('k', '{ not json');

  assert.equal(read('k'), undefined);
  assert.equal(disk.getString('k'), undefined, 'and the bad value is cleared');
});

test('reads and writes are namespaced and removable', () => {
  device();
  write(StorageKeys.rewards, { points: 120 });
  assert.deepEqual(read(StorageKeys.rewards), { points: 120 });
  remove(StorageKeys.rewards);
  assert.equal(read(StorageKeys.rewards), undefined);
});

// ---------------------------------------------------------------------------
// The money-critical state
// ---------------------------------------------------------------------------

test('uncollected legs survive a restart — otherwise the float is never repaid', () => {
  device();

  const before = new CollectionQueue(StorageKeys.collections);
  before.enqueue({ transactionId: 't1', userId: 'u1', leg: leg('acct_a', 3_000), now: FIXED_NOW });
  before.enqueue({ transactionId: 't2', userId: 'u1', leg: leg('acct_b', 1_500), now: FIXED_NOW });

  // Same disk, brand-new object graph: a relaunch.
  const after = new CollectionQueue(StorageKeys.collections);

  assert.equal(after.pending().length, 2, 'the debt is still owed');
  assert.equal(
    after.buildBatches().reduce((sum, b) => sum + b.totalInSourceCurrency, 0),
    4_500
  );
});

test('collected items stay collected across a restart, so nobody is debited twice', () => {
  device();

  const before = new CollectionQueue(StorageKeys.collections);
  const item = before.enqueue({
    transactionId: 't1',
    userId: 'u1',
    leg: leg('acct_a', 3_000),
    now: FIXED_NOW,
  });
  before.markCollected([item.id]);

  const after = new CollectionQueue(StorageKeys.collections);
  assert.equal(after.pending().length, 0);
  assert.equal(after.get(item.id)?.status, 'collected');
});

test('float exposure survives a restart, so the per-user ceiling still binds', () => {
  device();

  const before = new Treasury({ perUserOutstandingNGN: 5_000 }, StorageKeys.treasury);
  before.open({
    transactionId: 't1',
    userId: 'u1',
    amount: 4_500,
    currency: 'NGN',
    now: FIXED_NOW,
  });
  assert.equal(before.outstandingFor('u1'), 4_500);

  const after = new Treasury({ perUserOutstandingNGN: 5_000 }, StorageKeys.treasury);

  assert.equal(
    after.outstandingFor('u1'),
    4_500,
    'forgetting this would silently reset the limit on every relaunch'
  );
});

test('a completed idempotency key survives a restart, so a retry replays', () => {
  device();

  const before = new IdempotencyStore<string>(60_000, StorageKeys.idempotency);
  before.begin('key_1', FIXED_NOW);
  before.complete('key_1', 'the original result', FIXED_NOW);

  const after = new IdempotencyStore<string>(60_000, StorageKeys.idempotency);
  const outcome = after.begin('key_1', FIXED_NOW + 1_000);

  assert.equal(outcome.state, 'replay', 'a retry after a crash must not re-charge');
  if (outcome.state !== 'replay') return;
  assert.equal(outcome.result, 'the original result');
});

test('an in-flight key is NOT restored — its owner is gone', () => {
  device();

  const before = new IdempotencyStore<string>(60_000, StorageKeys.idempotency);
  before.begin('key_1', FIXED_NOW);
  // Process dies here: never completed, never abandoned.

  const after = new IdempotencyStore<string>(60_000, StorageKeys.idempotency);
  const outcome = after.begin('key_1', FIXED_NOW + 1_000);

  assert.equal(
    outcome.state,
    'fresh',
    'restoring it would deadlock the key forever, since nothing can complete it'
  );
});

test('an in-memory store keeps nothing, which is what tests want', () => {
  device();
  const queue = new CollectionQueue(null);
  queue.enqueue({ transactionId: 't1', userId: 'u1', leg: leg('a', 100), now: FIXED_NOW });

  assert.equal(new CollectionQueue(null).pending().length, 0);
});

// ---------------------------------------------------------------------------
// The daily limit, which previously did nothing
// ---------------------------------------------------------------------------

function riskFor(amount: number, dailyLimit: number, spentToday: number) {
  const result = planPayment([ngnBank(5_000_000, { id: 'a' })], amount, 'NGN', feed, {
    now: FIXED_NOW,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');

  return evaluatePaymentRisk({
    amountNGN: amount,
    payee: makePayee(),
    plan: result.plan,
    perTransactionLimitNGN: 10_000_000,
    dailyLimitNGN: dailyLimit,
    spentTodayNGN: spentToday,
    unusualAmountAlertsEnabled: false,
  });
}

test('a payment within the daily limit passes', () => {
  assert.equal(riskFor(50_000, 500_000, 100_000), null);
});

test('a payment that would breach the daily limit is blocked', () => {
  const alert = riskFor(50_000, 500_000, 470_000);

  assert.notEqual(alert, null, 'the limit must actually bind');
  assert.equal(alert!.blocked, true);
  assert.ok(alert!.reasons.some((r) => r.includes('daily limit')));
  assert.ok(alert!.reasons.some((r) => r.includes('30,000')), 'tells the user the headroom left');
});

test('the limit binds on accumulated spend, not just a single large payment', () => {
  // Each payment is individually small; together they exceed the ceiling.
  assert.equal(riskFor(10_000, 100_000, 0), null);
  assert.notEqual(riskFor(10_000, 100_000, 95_000), null);
});

test('spend exactly at the limit is allowed; a naira more is not', () => {
  assert.equal(riskFor(1_000, 100_000, 99_000), null, 'exactly at the ceiling');
  assert.notEqual(riskFor(1_001, 100_000, 99_000), null);
});
