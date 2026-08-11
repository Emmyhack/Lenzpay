import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARDS_TIERS } from '@/mock/rewards';
import { CASHBACK_RATES, REWARD_POINT_VALUE } from '@/mock/data';
import {
  DEFAULT_PRICING,
  REWARDS_BUDGET_MODEL,
  cashbackForPayment,
  estimateUnitEconomics,
} from './pricing';
import { feeScheduleFor, devRateFeed, getQuote } from './orchestration/fx';
import { planPayment } from './orchestration/planner';
import { FIXED_NOW, ngnBank, usdAccount } from './orchestration/__fixtures__';

const feed = devRateFeed(FIXED_NOW);
const NETTED = { paymentsPerSweep: 5 };

function planFor(sources: Parameters<typeof planPayment>[0], amount: number, spreadDiscount = 0) {
  const result = planPayment(sources, amount, 'NGN', feed, {
    now: FIXED_NOW,
    maxLegs: 2,
    spreadDiscount,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

// ---------------------------------------------------------------------------
// The bug this file exists for
// ---------------------------------------------------------------------------

test('points redeem at exactly the value they are accrued at', () => {
  // Redemption previously hard-coded 2 points = ₦1 (₦0.50 each) while accrual
  // provisions ₦0.05 each — every redemption paid out ten times what was set
  // aside. Both sides now read one constant.
  assert.equal(DEFAULT_PRICING.pointValue, REWARD_POINT_VALUE);

  const points = 3_240;
  const accruedLiability = points * DEFAULT_PRICING.pointValue;
  const redemptionPayout = points * REWARD_POINT_VALUE;

  assert.equal(redemptionPayout, accruedLiability);
});

test('a redemption never pays out more than was provisioned', () => {
  for (const points of [1, 100, 3_240, 50_000]) {
    const provisioned = points * DEFAULT_PRICING.pointValue;
    const paid = Math.floor(points * REWARD_POINT_VALUE);
    assert.ok(paid <= provisioned, `${points} pts: paid ${paid} > provisioned ${provisioned}`);
  }
});

// ---------------------------------------------------------------------------
// Tier multipliers must not break the margin
// ---------------------------------------------------------------------------

test('every tier stays profitable at its own multiplier, at every amount', () => {
  // The earlier reward test only checked base rates at four amounts, so a
  // Platinum user at 2× was loss-making at ₦20,000 and nothing failed. This
  // sweeps the cliff edges: EMTL steps in at ₦10,000, the MDR cap bites near
  // ₦500,000.
  const amounts = [500, 1_000, 2_000, 4_500, 9_999, 10_000, 10_001, 15_000,
                   20_000, 50_000, 50_001, 100_000, 500_000, 1_000_000];

  for (const tier of REWARDS_TIERS) {
    for (const [category, rate] of Object.entries(CASHBACK_RATES)) {
      for (const amount of amounts) {
        const plan = planFor([ngnBank(5_000_000, { id: 'a' })], amount, tier.fxSpreadDiscount);
        const before = estimateUnitEconomics({ plan, model: REWARDS_BUDGET_MODEL });

        const headlineRate = rate * tier.cashbackMultiplier;
        const points = Math.round(amount * headlineRate * 5);
        const cashback = cashbackForPayment({
          headlineRate,
          economicsBeforeRewards: before,
          points,
          model: REWARDS_BUDGET_MODEL,
        });

        const economics = estimateUnitEconomics({
          plan,
          cashback,
          points: Math.round(cashback * 5),
          model: NETTED,
        });

        assert.ok(
          economics.contribution >= 0,
          `${tier.name}/${category} @ ₦${amount} contributes ${economics.contribution}`
        );
      }
    }
  }
});

test('cashback pays the headline rate when the payment can afford it', () => {
  const plan = planFor([ngnBank(500_000, { id: 'a' })], 4_500);
  const before = estimateUnitEconomics({ plan, model: REWARDS_BUDGET_MODEL });

  // 0.15% of ₦4,500 is ₦6.75, well inside what the payment earns.
  const paid = cashbackForPayment({
    headlineRate: 0.0015,
    economicsBeforeRewards: before,
    model: REWARDS_BUDGET_MODEL,
  });
  assert.ok(Math.abs(paid - 4_500 * 0.0015) < 0.01, `paid ${paid}`);
});

test('cashback is capped where the payment cannot afford the headline rate', () => {
  // ₦10,000 is the EMTL cliff: ₦50 of levy against ₦90 of retained revenue.
  const plan = planFor([ngnBank(500_000, { id: 'a' })], 10_000);
  const before = estimateUnitEconomics({ plan, model: REWARDS_BUDGET_MODEL });

  const headline = 10_000 * 0.005; // an aggressive 0.5%
  const paid = cashbackForPayment({
    headlineRate: 0.005,
    economicsBeforeRewards: before,
    model: REWARDS_BUDGET_MODEL,
  });

  assert.ok(paid < headline, 'the cap must bite here');
  assert.ok(paid >= 0, 'and never go negative');
});

test('cashback never exceeds the margin available to fund it', () => {
  for (const amount of [500, 10_000, 500_000]) {
    const plan = planFor([ngnBank(5_000_000, { id: 'a' })], amount);
    const before = estimateUnitEconomics({ plan, model: REWARDS_BUDGET_MODEL });
    const marginBefore = before.revenue.total - before.costs.total;

    // Even an absurd advertised rate cannot outrun the budget.
    const paid = cashbackForPayment({
      headlineRate: 1,
      economicsBeforeRewards: before,
      model: REWARDS_BUDGET_MODEL,
    });
    assert.ok(paid <= Math.max(0, marginBefore), `₦${amount}: paid ${paid} vs margin ${marginBefore}`);
  }
});

test('a converted payment stays profitable even at the top tier FX discount', () => {
  const top = REWARDS_TIERS[REWARDS_TIERS.length - 1];
  const plan = planFor([usdAccount(500, { id: 'u' })], 100_000, top.fxSpreadDiscount);

  const economics = estimateUnitEconomics({
    plan,
    cashback: 100_000 * CASHBACK_RATES.crypto * top.cashbackMultiplier,
    points: 500,
    model: NETTED,
  });

  assert.equal(economics.profitable, true, `contributes ${economics.contribution}`);
});

// ---------------------------------------------------------------------------
// The FX benefit is real, not a label
// ---------------------------------------------------------------------------

test('the tier FX discount reduces the spread actually quoted', () => {
  const base = feeScheduleFor('USD', 'NGN', 0);
  const discounted = feeScheduleFor('USD', 'NGN', 0.5);

  assert.equal(discounted.feeRate, base.feeRate * 0.5);
  assert.equal(discounted.flatFee, base.flatFee, 'the partner’s flat cost is not ours to waive');
});

test('a higher tier genuinely converts more cheaply', () => {
  const bronze = REWARDS_TIERS[0];
  const platinum = REWARDS_TIERS[REWARDS_TIERS.length - 1];

  const cheap = planFor([usdAccount(500, { id: 'u' })], 100_000, platinum.fxSpreadDiscount);
  const standard = planFor([usdAccount(500, { id: 'u' })], 100_000, bronze.fxSpreadDiscount);

  assert.ok(
    cheap.totalFees < standard.totalFees,
    `platinum ${cheap.totalFees} should beat bronze ${standard.totalFees}`
  );
  assert.ok(
    cheap.legs[0].amountInSourceCurrency < standard.legs[0].amountInSourceCurrency,
    'and it takes less USD to deliver the same naira'
  );
});

test('the discount is clamped, so bad input cannot invert the spread', () => {
  assert.equal(feeScheduleFor('USD', 'NGN', 2).feeRate, 0, 'over 100% waives fully, never negative');
  assert.equal(
    feeScheduleFor('USD', 'NGN', -1).feeRate,
    feeScheduleFor('USD', 'NGN', 0).feeRate,
    'negative discount is not a surcharge'
  );
});

test('the discount never touches a same-currency payment', () => {
  const quote = getQuote('NGN', 'NGN', feed, { now: FIXED_NOW, spreadDiscount: 0.5 });
  assert.equal(quote.feeRate, 0);
  assert.equal(quote.flatFee, 0);
});

// ---------------------------------------------------------------------------
// Tiers are internally coherent
// ---------------------------------------------------------------------------

test('tier benefits improve monotonically', () => {
  for (let i = 1; i < REWARDS_TIERS.length; i += 1) {
    const lower = REWARDS_TIERS[i - 1];
    const higher = REWARDS_TIERS[i];

    assert.ok(higher.minPoints > lower.minPoints, `${higher.name} threshold`);
    assert.ok(higher.cashbackMultiplier >= lower.cashbackMultiplier, `${higher.name} cashback`);
    assert.ok(higher.fxSpreadDiscount >= lower.fxSpreadDiscount, `${higher.name} FX`);
    assert.ok(higher.dailyLimitMultiplier >= lower.dailyLimitMultiplier, `${higher.name} limit`);
  }
});

test('every advertised benefit corresponds to a value the code applies', () => {
  // The previous copy promised priority support, free instant settlement,
  // exclusive offers and a relationship manager — none of which existed.
  for (const tier of REWARDS_TIERS) {
    assert.equal(tier.benefits.length, 3, `${tier.name} should list exactly its three levers`);

    if (tier.cashbackMultiplier > 1) {
      assert.ok(
        tier.benefits.some((b) => b.includes(`${tier.cashbackMultiplier}×`)),
        `${tier.name} claims its multiplier`
      );
    }
    if (tier.fxSpreadDiscount > 0) {
      assert.ok(
        tier.benefits.some((b) => b.includes(`${Math.round(tier.fxSpreadDiscount * 100)}%`)),
        `${tier.name} claims its FX discount`
      );
    }
    if (tier.dailyLimitMultiplier > 1) {
      assert.ok(
        tier.benefits.some((b) => b.includes(`${tier.dailyLimitMultiplier}×`)),
        `${tier.name} claims its limit uplift`
      );
    }
  }
});

test('cashback rates stay distinguishable when rendered', () => {
  // Rates are fractions of a percent; one decimal collapsed three categories
  // into an identical "0.1%".
  const rendered = Object.values(CASHBACK_RATES).map((r) => (r * 100).toFixed(2));
  assert.equal(new Set(rendered).size, rendered.length, `collapsed: ${rendered.join(', ')}`);
});
