import test from 'node:test';
import assert from 'node:assert/strict';

import { sumAmounts } from '@/services/money';
import { planBalances, planPayment, summarisePlan } from './planner';
import { rankSources } from './ranking';
import { FIXED_NOW, cryptoWallet, feed, ngnBank, usdAccount } from './__fixtures__';

const at = { now: FIXED_NOW };

// ---------------------------------------------------------------------------
// Single-source fast path (§5.3)
// ---------------------------------------------------------------------------

test('a single covering account takes the fast path', () => {
  const sources = [ngnBank(842_000, { label: 'Access' }), ngnBank(320_000, { label: 'OPay' })];
  const result = planPayment(sources, 4_500, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.plan.kind, 'single_source');
  assert.equal(result.plan.legs.length, 1);
  assert.equal(result.plan.legs[0].source.label, 'Access');
  assert.equal(result.plan.legs[0].amountInSettlementCurrency, 4_500);
  assert.equal(result.plan.totalFees, 0);
  assert.equal(result.plan.expiresAt, null, 'same-currency plans have no rate lock');
});

test('same-currency sources outrank FX and crypto for an NGN payment', () => {
  const sources = [
    cryptoWallet('BTC', 1, { label: 'BTC' }),
    usdAccount(10_000, { label: 'USD' }),
    ngnBank(500_000, { label: 'NGN Bank' }),
  ];
  const ranked = rankSources(sources, 4_500, 'NGN', feed(), at);

  assert.deepEqual(
    ranked.map((entry) => entry.source.label),
    ['NGN Bank', 'USD', 'BTC']
  );
});

test('a higher user priority weight overrides the same-currency preference', () => {
  const sources = [
    ngnBank(500_000, { label: 'NGN Bank', priorityWeight: 10 }),
    usdAccount(10_000, { label: 'USD', priorityWeight: 100 }),
  ];
  const result = planPayment(sources, 4_500, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.legs[0].source.label, 'USD');
});

// ---------------------------------------------------------------------------
// The waterfall / "scrape" (§5.4)
// ---------------------------------------------------------------------------

test('no single account covers it, so the engine builds a waterfall that sums exactly', () => {
  const sources = [
    ngnBank(3_000, { label: 'GTBank' }),
    ngnBank(2_500, { label: 'Access' }),
    ngnBank(1_000, { label: 'Kuda' }),
  ];
  const result = planPayment(sources, 4_500, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.plan.kind, 'waterfall');
  assert.equal(planBalances(result.plan), true);
  assert.equal(
    sumAmounts(
      result.plan.legs.map((leg) => leg.amountInSettlementCurrency),
      'NGN'
    ),
    4_500
  );
  assert.equal(summarisePlan(result.plan), 'Split across 2 sources');

  // Draws the top-ranked account dry before touching the next.
  assert.deepEqual(
    result.plan.legs.map((leg) => [leg.source.label, leg.amountInSettlementCurrency]),
    [
      ['GTBank', 3_000],
      ['Access', 1_500],
    ]
  );
});

test('a mixed NGN + USD waterfall still delivers the exact amount', () => {
  // Neither covers ₦10,000 alone: ₦3,000 + $5 (≈₦7,632 net) = ₦10,632.
  const sources = [ngnBank(3_000, { label: 'GTBank' }), usdAccount(5, { label: 'Grey USD' })];
  const result = planPayment(sources, 10_000, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(planBalances(result.plan), true);
  assert.equal(result.plan.legs.length, 2);

  const usdLeg = result.plan.legs[1];
  assert.equal(usdLeg.sourceCurrency, 'USD');
  assert.equal(usdLeg.amountInSettlementCurrency, 7_000);
  // Debits enough USD to actually deliver ₦7,000 net of the 0.9% spread + ₦50.
  assert.ok(usdLeg.amountInSourceCurrency * 1_550 > 7_000);
  assert.ok(usdLeg.amountInSourceCurrency <= 5);
  assert.ok(usdLeg.feeInSettlementCurrency > 0);
  assert.notEqual(result.plan.expiresAt, null, 'FX legs impose a rate lock');
});

test('no leg ever debits more than its source holds', () => {
  const sources = [usdAccount(1.23, { label: 'Dust USD' }), ngnBank(1_000_000)];
  const result = planPayment(sources, 900_000, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const leg of result.plan.legs) {
    assert.ok(
      leg.amountInSourceCurrency <= leg.source.rawBalance,
      `${leg.source.label} debited ${leg.amountInSourceCurrency} > balance ${leg.source.rawBalance}`
    );
  }
});

// ---------------------------------------------------------------------------
// Feasibility and failure (§5.4 step 2, §5.7)
// ---------------------------------------------------------------------------

test('insufficient total funds fails before any plan is built, reporting the shortfall', () => {
  const sources = [ngnBank(1_000), ngnBank(2_000)];
  const result = planPayment(sources, 5_000, 'NGN', feed(), at);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.reason, 'insufficient_funds');
  assert.equal(result.totalAvailable, 3_000);
  assert.equal(result.shortfall, 2_000);
});

test('the shortfall accounts for conversion cost, not the headline balance', () => {
  // $10 is ₦15,500 gross but only ₦15,310.50 after the 0.9% spread and ₦50.
  const sources = [usdAccount(10)];
  const result = planPayment(sources, 15_400, 'NGN', feed(), at);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'insufficient_funds');
  assert.equal(result.totalAvailable, 15_310.5);
  assert.equal(result.shortfall, 89.5);
});

test('a zero or negative amount is rejected outright', () => {
  for (const amount of [0, -1]) {
    const result = planPayment([ngnBank(10_000)], amount, 'NGN', feed(), at);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, 'invalid_amount');
  }
});

test('empty and drained wallets produce no_eligible_sources', () => {
  assert.equal(planPayment([], 1_000, 'NGN', feed(), at).ok, false);

  const drained = planPayment([ngnBank(0), ngnBank(0)], 1_000, 'NGN', feed(), at);
  assert.equal(drained.ok, false);
  if (drained.ok) return;
  assert.equal(drained.reason, 'no_eligible_sources');
});

test('funds that exist but exceed the leg cap are reported honestly', () => {
  const sources = [ngnBank(100), ngnBank(100), ngnBank(100), ngnBank(100), ngnBank(100)];
  const result = planPayment(sources, 500, 'NGN', feed(), { ...at, maxLegs: 4 });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'exceeds_leg_limit');
  assert.equal(result.shortfall, 0, 'the user is not actually short of money');
  assert.equal(result.totalAvailable, 500);
});

test('within the leg cap, the deepest accounts are chosen when rank order cannot cover', () => {
  // Rank order (equal weights → deepest first is not guaranteed) must still
  // find a covering set rather than giving up.
  const sources = [
    ngnBank(10, { label: 'tiny', priorityWeight: 100 }),
    ngnBank(10, { label: 'tiny2', priorityWeight: 99 }),
    ngnBank(5_000, { label: 'deep', priorityWeight: 1 }),
  ];
  const result = planPayment(sources, 5_000, 'NGN', feed(), { ...at, maxLegs: 2 });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(planBalances(result.plan), true);
  assert.ok(result.plan.legs.some((leg) => leg.source.label === 'deep'));
});

// ---------------------------------------------------------------------------
// Reserve accounts (§5.2 "keep buffer")
// ---------------------------------------------------------------------------

test('a two-leg split of spending money beats a one-leg hit on reserve funds', () => {
  const sources = [
    ngnBank(3_000, { label: 'Everyday A' }),
    ngnBank(2_000, { label: 'Everyday B' }),
    ngnBank(500_000, { label: 'Emergency', isReserve: true }),
  ];
  const result = planPayment(sources, 4_500, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.plan.kind, 'waterfall');
  assert.ok(
    result.plan.legs.every((leg) => leg.source.label !== 'Emergency'),
    'reserve funds must stay untouched while spending accounts can cover it'
  );
});

test('reserve funds are used when nothing else can cover the payment', () => {
  const sources = [
    ngnBank(1_000, { label: 'Everyday' }),
    ngnBank(500_000, { label: 'Emergency', isReserve: true }),
  ];
  const result = planPayment(sources, 4_500, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.plan.legs.some((leg) => leg.source.label === 'Emergency'));
});

// ---------------------------------------------------------------------------
// Manual override (§5.1)
// ---------------------------------------------------------------------------

test('a manually chosen source is honoured when it can cover the payment', () => {
  const sources = [
    ngnBank(500_000, { id: 'src_ngn', label: 'NGN Bank' }),
    usdAccount(1_000, { id: 'src_usd', label: 'USD' }),
  ];
  const result = planPayment(sources, 4_500, 'NGN', feed(), {
    ...at,
    preferredSourceId: 'src_usd',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.kind, 'single_source');
  assert.equal(result.plan.legs[0].source.id, 'src_usd');
});

test('a manual choice that cannot cover the payment falls back to automatic planning', () => {
  const sources = [
    ngnBank(500_000, { id: 'src_ngn', label: 'NGN Bank' }),
    ngnBank(100, { id: 'src_small', label: 'Small' }),
  ];
  const result = planPayment(sources, 4_500, 'NGN', feed(), {
    ...at,
    preferredSourceId: 'src_small',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.legs[0].source.id, 'src_ngn');
});

// ---------------------------------------------------------------------------
// Crypto (§5.6)
// ---------------------------------------------------------------------------

test('a crypto wallet can settle an NGN payment on its own', () => {
  const sources = [cryptoWallet('USDT', 320, { label: 'USDT' })];
  const result = planPayment(sources, 100_000, 'NGN', feed(), at);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const [leg] = result.plan.legs;
  assert.equal(leg.sourceCurrency, 'USDT');
  assert.equal(leg.settlementCurrency, 'NGN');
  assert.equal(leg.amountInSettlementCurrency, 100_000);
  assert.equal(leg.quote.provider, 'crypto_liquidity');
  assert.equal(summarisePlan(result.plan), 'USDT (auto-converted)');
});

test('stablecoin conversion is preferred over a volatile asset, all else equal', () => {
  const sources = [
    cryptoWallet('BTC', 1, { label: 'BTC' }),
    cryptoWallet('USDT', 200_000, { label: 'USDT' }),
  ];
  const ranked = rankSources(sources, 50_000, 'NGN', feed(), at);
  assert.equal(ranked[0].source.label, 'USDT');
});
