import test from 'node:test';
import assert from 'node:assert/strict';

import { planPayment } from './orchestration/planner';
import { devRateFeed } from './orchestration/fx';
import {
  DEFAULT_PRICING,
  blendedEconomics,
  breakEvenPayments,
  emtl,
  estimateUnitEconomics,
  nipTransferFee,
  sustainableCashbackRate,
} from './pricing';
import { CASHBACK_RATES, REWARD_POINT_VALUE } from '@/mock/data';
import { FIXED_NOW, ngnBank, usdAccount } from './orchestration/__fixtures__';

const feed = devRateFeed(FIXED_NOW);

function planFor(sources: Parameters<typeof planPayment>[0], amount: number, maxLegs = 2) {
  const result = planPayment(sources, amount, 'NGN', feed, { now: FIXED_NOW, maxLegs });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

/** The netting assumption the business is built on. */
const NETTED = { paymentsPerSweep: 5 };

// ---------------------------------------------------------------------------
// Rail charges
// ---------------------------------------------------------------------------

test('NIP transfer fees follow the CBN bands', () => {
  assert.equal(nipTransferFee(4_999), 0);
  assert.equal(nipTransferFee(5_000), 10);
  assert.equal(nipTransferFee(50_000), 10);
  assert.equal(nipTransferFee(50_001), 50);
});

test('EMTL applies from ₦10,000 up', () => {
  assert.equal(emtl(9_999), 0);
  assert.equal(emtl(10_000), 50);
});

// ---------------------------------------------------------------------------
// The finding that justifies netting
// ---------------------------------------------------------------------------

test('without netting, an ordinary naira payment loses money', () => {
  const economics = estimateUnitEconomics({
    plan: planFor([ngnBank(50_000, { id: 'a' })], 4_500),
    model: { paymentsPerSweep: 1 },
  });

  assert.equal(
    economics.profitable,
    false,
    'a single ₦55 debit against ~₦40 of retained MDR cannot pay for itself'
  );
});

test('netting turns the same payment profitable', () => {
  const economics = estimateUnitEconomics({
    plan: planFor([ngnBank(50_000, { id: 'a' })], 4_500),
    model: NETTED,
  });

  assert.equal(economics.profitable, true);
  assert.ok(economics.marginRate > 0.004, `margin was ${economics.marginRate}`);
});

test('collection cost falls linearly with payments per sweep', () => {
  const plan = planFor([ngnBank(50_000, { id: 'a' })], 4_500);
  const one = estimateUnitEconomics({ plan, model: { paymentsPerSweep: 1 } });
  const ten = estimateUnitEconomics({ plan, model: { paymentsPerSweep: 10 } });

  assert.equal(ten.costs.collection, one.costs.collection / 10);
  assert.ok(ten.contribution > one.contribution);
});

// ---------------------------------------------------------------------------
// The split has to pay for itself
// ---------------------------------------------------------------------------

test('a two-leg split is roughly margin-neutral against a single-source payment', () => {
  const single = estimateUnitEconomics({
    plan: planFor([ngnBank(50_000, { id: 'a' })], 4_500),
    model: NETTED,
  });
  const split = estimateUnitEconomics({
    plan: planFor([ngnBank(3_000, { id: 'a' }), ngnBank(2_500, { id: 'b' })], 4_500),
    model: NETTED,
  });

  assert.equal(split.legs, 2);
  assert.equal(split.profitable, true);
  // The split fee exists precisely to close this gap; within ₦5 is close enough
  // that the engine isn't penalised for splitting.
  assert.ok(
    Math.abs(split.contribution - single.contribution) < 5,
    `single ${single.contribution} vs split ${split.contribution}`
  );
});

test('without the split fee, splitting is materially worse than not splitting', () => {
  const withoutFee = { ...NETTED, splitFee: 0 };
  const single = estimateUnitEconomics({
    plan: planFor([ngnBank(50_000, { id: 'a' })], 4_500),
    model: withoutFee,
  });
  const split = estimateUnitEconomics({
    plan: planFor([ngnBank(3_000, { id: 'a' }), ngnBank(2_500, { id: 'b' })], 4_500),
    model: withoutFee,
  });

  assert.ok(split.contribution < single.contribution, 'the extra debit is not free');
});

// ---------------------------------------------------------------------------
// Rewards must fit inside the margin
// ---------------------------------------------------------------------------

test('every configured cashback rate sits under the sustainable ceiling', () => {
  const plan = planFor([ngnBank(50_000, { id: 'a' })], 4_500);
  const beforeRewards = estimateUnitEconomics({ plan, model: NETTED });
  // Converted payments carry spread margin too, so allow the FX-bearing
  // categories a higher ceiling by measuring against a converted plan.
  const convertedPlan = planFor([usdAccount(500, { id: 'u' })], 4_500);
  const convertedBefore = estimateUnitEconomics({ plan: convertedPlan, model: NETTED });

  const bankCeiling = sustainableCashbackRate(beforeRewards, 1);
  const fxCeiling = sustainableCashbackRate(convertedBefore, 1);

  for (const [category, rate] of Object.entries(CASHBACK_RATES)) {
    const ceiling = category === 'crypto' ? fxCeiling : bankCeiling;
    assert.ok(
      rate <= ceiling,
      `${category} cashback ${(rate * 100).toFixed(3)}% exceeds the ${(ceiling * 100).toFixed(3)}% a payment can fund`
    );
  }
});

test('a payment stays profitable with its rewards actually paid out', () => {
  for (const [category, rate] of Object.entries(CASHBACK_RATES)) {
    for (const amount of [1_000, 4_500, 20_000, 100_000]) {
      const plan = planFor([ngnBank(500_000, { id: 'a' })], amount);
      const economics = estimateUnitEconomics({
        plan,
        cashback: amount * rate,
        points: amount * 0.005,
        model: NETTED,
      });

      assert.equal(
        economics.profitable,
        true,
        `${category} @ ₦${amount} contributes ${economics.contribution}`
      );
    }
  }
});

test('the old reward rates would have been ruinous', () => {
  // 3% cashback, as originally configured for the crypto category.
  const plan = planFor([ngnBank(500_000, { id: 'a' })], 4_500);
  const economics = estimateUnitEconomics({
    plan,
    cashback: 4_500 * 0.03,
    points: 4_500 * 0.005,
    model: NETTED,
  });

  assert.equal(economics.profitable, false);
  assert.ok(economics.costs.rewards > economics.revenue.total);
});

test('points are accrued as a real liability, not treated as free', () => {
  const plan = planFor([ngnBank(50_000, { id: 'a' })], 4_500);
  const withPoints = estimateUnitEconomics({ plan, points: 1_000, model: NETTED });
  const without = estimateUnitEconomics({ plan, model: NETTED });

  assert.equal(
    withPoints.costs.rewards - without.costs.rewards,
    1_000 * REWARD_POINT_VALUE
  );
  assert.equal(DEFAULT_PRICING.pointValue, REWARD_POINT_VALUE);
});

// ---------------------------------------------------------------------------
// Revenue composition
// ---------------------------------------------------------------------------

test('a converted payment earns FX margin on top of MDR', () => {
  const bank = estimateUnitEconomics({
    plan: planFor([ngnBank(50_000, { id: 'a' })], 4_500),
    model: NETTED,
  });
  const converted = estimateUnitEconomics({
    plan: planFor([usdAccount(500, { id: 'u' })], 4_500),
    model: NETTED,
  });

  assert.equal(bank.revenue.fxMargin, 0);
  assert.ok(converted.revenue.fxMargin > 0);
  assert.ok(converted.contribution > bank.contribution, 'FX legs are the better business');
});

test('the FX partner takes the share of the spread we do not keep', () => {
  const plan = planFor([usdAccount(500, { id: 'u' })], 100_000);
  const economics = estimateUnitEconomics({ plan, model: NETTED });

  assert.ok(
    Math.abs(economics.revenue.fxMargin + economics.costs.fxPartner - plan.totalFees) < 0.02,
    'the user-facing spread must split exactly between us and the partner'
  );
});

test('the MDR cap bites on large payments', () => {
  const capped = estimateUnitEconomics({
    plan: planFor([ngnBank(50_000_000, { id: 'a' })], 1_000_000),
    model: NETTED,
  });

  assert.equal(
    capped.revenue.merchantFee,
    DEFAULT_PRICING.mdrCap * DEFAULT_PRICING.lenzMdrShare
  );
});

test('float cost scales with how long collection is deferred', () => {
  const plan = planFor([ngnBank(500_000, { id: 'a' })], 100_000);
  const sameDay = estimateUnitEconomics({ plan, model: { ...NETTED, floatDaysOutstanding: 1 } });
  const week = estimateUnitEconomics({ plan, model: { ...NETTED, floatDaysOutstanding: 7 } });

  assert.ok(week.costs.float > sameDay.costs.float);
  assert.ok(
    week.contribution < sameDay.contribution,
    'a longer sweep window trades collection cost for carry cost'
  );
});

// ---------------------------------------------------------------------------
// Portfolio view
// ---------------------------------------------------------------------------

test('blended economics aggregates a portfolio and flags loss-makers', () => {
  const good = estimateUnitEconomics({
    plan: planFor([ngnBank(500_000, { id: 'a' })], 50_000),
    model: NETTED,
  });
  const bad = estimateUnitEconomics({
    plan: planFor([ngnBank(500_000, { id: 'a' })], 4_500),
    model: { paymentsPerSweep: 1 },
  });

  const blended = blendedEconomics([good, bad]);

  assert.equal(blended.payments, 2);
  assert.equal(blended.volume, 54_500);
  assert.equal(blended.lossMakingShare, 0.5);
  assert.equal(
    blended.contribution,
    Math.round((good.contribution + bad.contribution) * 100) / 100
  );
});

test('break-even volume follows from average contribution', () => {
  assert.equal(breakEvenPayments(1_000_000, 25), 40_000);
  assert.equal(breakEvenPayments(1_000_000, 0), Number.POSITIVE_INFINITY);
  assert.equal(breakEvenPayments(1_000_000, -5), Number.POSITIVE_INFINITY);
});

test('the MDR floor is what makes small payments viable', () => {
  const plan = planFor([ngnBank(500_000, { id: 'a' })], 1_000);

  const withFloor = estimateUnitEconomics({
    plan,
    cashback: 1_000 * CASHBACK_RATES.transport,
    points: 5,
    model: NETTED,
  });
  const withoutFloor = estimateUnitEconomics({
    plan,
    cashback: 1_000 * CASHBACK_RATES.transport,
    points: 5,
    model: { ...NETTED, mdrFloor: 0 },
  });

  assert.equal(withFloor.profitable, true);
  assert.equal(
    withoutFloor.profitable,
    false,
    'a percentage-only fee cannot cover a fixed debit cost on a small payment'
  );
});

test('the floor stops binding once the percentage exceeds it', () => {
  // 1.5% of ₦2,000 = ₦30, exactly the floor. Above that, percentage rules.
  const small = estimateUnitEconomics({
    plan: planFor([ngnBank(500_000, { id: 'a' })], 1_000),
    model: NETTED,
  });
  const larger = estimateUnitEconomics({
    plan: planFor([ngnBank(500_000, { id: 'a' })], 10_000),
    model: NETTED,
  });

  assert.equal(small.revenue.merchantFee, DEFAULT_PRICING.mdrFloor * DEFAULT_PRICING.lenzMdrShare);
  assert.ok(larger.revenue.merchantFee > small.revenue.merchantFee);
});
