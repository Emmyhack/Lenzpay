import type { CurrencyCode } from '@/types/payment';
import type { FundingPlan } from '@/types/orchestration';
import { roundCurrency } from '@/services/money';
import { collectionCost } from '@/services/orchestration/costs';

/**
 * The profit model.
 *
 * Every payment is priced end to end here: what Lenz earns, what the rails
 * cost, and what is left. It exists because the product's differentiating
 * feature — splitting a payment across accounts — is also its most expensive
 * path, and "is this payment profitable?" must be a number the code can answer
 * rather than a hope.
 *
 * ## The three findings this model surfaced
 *
 * 1. **Rewards outran revenue.** Cashback was configured up to 3% against gross
 *    merchant revenue of ~1.5%. Every crypto-category payment lost money on
 *    rewards alone, before a single rail was touched. Rates are now derived
 *    from net contribution (see `sustainableCashbackRate`) rather than picked.
 *
 * 2. **A single-source payment is not automatically profitable.** ₦4,500 at
 *    1.5% earns ~₦68 gross; one bank debit costs ₦55. Before netting, the
 *    margin on a typical small payment is roughly zero.
 *
 * 3. **Netting is the whole business.** Amortising one debit across a day of
 *    payments is the difference between a negative and a workable margin —
 *    a bigger lever than any pricing change. See `collections.ts`.
 *
 * All rates below are defaults for modelling. Replace with negotiated terms
 * before launch; `PricingModel` is designed to be overridden wholesale.
 *
 * ## Why this isn't imported by the app
 *
 * This is back-office logic: pricing decisions and margin analysis belong to
 * the backend and to whoever sets the take rate, not to a phone. It is
 * deliberately absent from the mobile bundle.
 *
 * It is not dead code, though, and the coupling that keeps it honest is real:
 * `pricing.test.ts` asserts against the app's *live* `CASHBACK_RATES` and
 * `REWARD_POINT_VALUE`. Raise a reward rate in the app beyond what a payment
 * can fund and this model fails the build. The app cannot drift away from its
 * own economics without someone noticing.
 */

// ---------------------------------------------------------------------------
// Model inputs
// ---------------------------------------------------------------------------

export interface PricingModel {
  /** Merchant discount rate charged on the payment. */
  mdrRate: number;
  /** Ceiling on the MDR, in settlement currency. */
  mdrCap: number;
  /**
   * Floor on the MDR, in settlement currency.
   *
   * A percentage-only fee cannot fund a small payment: a ₦1,000 payment earns
   * ₦15 gross at 1.5%, while one amortised bank debit costs ~₦11 and rewards
   * take another ~₦1.75. Below roughly ₦2,000 the fee has to be flat or the
   * payment is loss-making no matter how well the engine routes it. A minimum
   * fee is standard practice on these rails for exactly this reason.
   */
  mdrFloor: number;
  /**
   * Share of the MDR Lenz keeps. Under a partner licence the PSP takes the
   * rest; at `own_licence` this approaches 1.
   */
  lenzMdrShare: number;
  /** Share of the FX spread Lenz keeps, the remainder going to the FX partner. */
  lenzFxShare: number;
  /** Flat fee for a multi-source payment, charged to the user. */
  splitFee: number;
  /** Monthly subscription revenue attributable per active payment, if any. */
  subscriptionPerPayment: number;
  /** Annualised cost of the capital sitting in float. */
  floatCostAnnualRate: number;
  /** How long float is outstanding before collection, in days. */
  floatDaysOutstanding: number;
  /**
   * Payments expected to share one netted debit per account per sweep.
   * 1 means no netting. This is the single most sensitive input in the model.
   */
  paymentsPerSweep: number;
  /** Cash value of one reward point, for accruing the liability. */
  pointValue: number;
}

export const DEFAULT_PRICING: PricingModel = {
  mdrRate: 0.015,
  mdrCap: 2_000,
  mdrFloor: 30,
  lenzMdrShare: 0.6,
  lenzFxShare: 0.55,
  /**
   * Calibrated so a two-leg split lands at roughly the same contribution as a
   * single-source payment of the same size. Without it the engine is penalised
   * for doing the one thing that makes the product distinctive.
   */
  splitFee: 10,
  subscriptionPerPayment: 0,
  floatCostAnnualRate: 0.25,
  floatDaysOutstanding: 1,
  paymentsPerSweep: 1,
  pointValue: 0.05,
};

// ---------------------------------------------------------------------------
// Rail charges (Nigeria)
// ---------------------------------------------------------------------------

/**
 * NIP transfer fee for the payout leg, per the CBN guide to charges: free below
 * ₦5,000, ₦10 up to ₦50,000, ₦50 above.
 */
export function nipTransferFee(amount: number): number {
  if (amount < 5_000) return 0;
  if (amount <= 50_000) return 10;
  return 50;
}

/**
 * Electronic Money Transfer Levy — ₦50 on transfers of ₦10,000 and above,
 * borne by the sender. On the payout leg the sender is our float, so it is our
 * cost.
 */
export function emtl(amount: number): number {
  return amount >= 10_000 ? 50 : 0;
}

// ---------------------------------------------------------------------------
// Unit economics
// ---------------------------------------------------------------------------

export interface RevenueBreakdown {
  merchantFee: number;
  fxMargin: number;
  splitFee: number;
  subscription: number;
  total: number;
}

export interface CostBreakdown {
  /** Debits to pull the funds in, amortised across the netting window. */
  collection: number;
  /** Payout to the payee: transfer fee plus levy. */
  payout: number;
  /** The FX partner's share of the spread. */
  fxPartner: number;
  /** Cost of capital while the float is outstanding. */
  float: number;
  /** Cashback paid plus the accrued value of points issued. */
  rewards: number;
  total: number;
}

export interface UnitEconomics {
  amount: number;
  currency: CurrencyCode;
  legs: number;
  revenue: RevenueBreakdown;
  costs: CostBreakdown;
  /** Revenue minus costs, in settlement currency. */
  contribution: number;
  /** Contribution as a fraction of the payment. */
  marginRate: number;
  profitable: boolean;
}

export interface EconomicsInput {
  plan: FundingPlan;
  /** Cashback the user will be paid, in settlement currency. */
  cashback?: number;
  /** Points issued, accrued at `pointValue`. */
  points?: number;
  model?: Partial<PricingModel>;
}

export function estimateUnitEconomics(input: EconomicsInput): UnitEconomics {
  const model = { ...DEFAULT_PRICING, ...input.model };
  const { plan } = input;
  const currency = plan.currency;
  const amount = plan.amount;

  // ---- Revenue ----------------------------------------------------------
  // Floor first, then cap — a small payment pays the flat minimum, a large one
  // pays the capped percentage.
  const grossMerchantFee = Math.min(
    Math.max(amount * model.mdrRate, model.mdrFloor),
    model.mdrCap
  );
  const merchantFee = grossMerchantFee * model.lenzMdrShare;

  // The spread charged to the user, split with the FX partner.
  const grossFxSpread = plan.totalFees;
  const fxMargin = grossFxSpread * model.lenzFxShare;
  const fxPartner = grossFxSpread - fxMargin;

  const splitFee = plan.legs.length > 1 ? model.splitFee : 0;

  const revenue: RevenueBreakdown = {
    merchantFee: roundCurrency(merchantFee, currency),
    fxMargin: roundCurrency(fxMargin, currency),
    splitFee: roundCurrency(splitFee, currency),
    subscription: roundCurrency(model.subscriptionPerPayment, currency),
    total: roundCurrency(
      merchantFee + fxMargin + splitFee + model.subscriptionPerPayment,
      currency
    ),
  };

  // ---- Costs ------------------------------------------------------------
  // Netting amortises one debit per account across every payment in the sweep
  // window, which is why `paymentsPerSweep` dominates this model.
  const rawCollection = plan.legs.reduce(
    (sum, leg) => sum + collectionCost(leg.source, leg.amountInSettlementCurrency, currency),
    0
  );
  const collection = rawCollection / Math.max(1, model.paymentsPerSweep);

  const payout = nipTransferFee(amount) + emtl(amount);

  const floatCost =
    amount * model.floatCostAnnualRate * (model.floatDaysOutstanding / 365);

  const rewards = (input.cashback ?? 0) + (input.points ?? 0) * model.pointValue;

  const costs: CostBreakdown = {
    collection: roundCurrency(collection, currency),
    payout: roundCurrency(payout, currency),
    fxPartner: roundCurrency(fxPartner, currency),
    float: roundCurrency(floatCost, currency),
    rewards: roundCurrency(rewards, currency),
    total: roundCurrency(collection + payout + fxPartner + floatCost + rewards, currency),
  };

  const contribution = roundCurrency(revenue.total - costs.total, currency);

  return {
    amount,
    currency,
    legs: plan.legs.length,
    revenue,
    costs,
    contribution,
    marginRate: amount > 0 ? contribution / amount : 0,
    profitable: contribution > 0,
  };
}

// ---------------------------------------------------------------------------
// Reward affordability
// ---------------------------------------------------------------------------

/**
 * The largest cashback rate a payment can fund out of its own margin.
 *
 * Rewards are the one cost fully under our control, so they should be derived
 * from what a payment actually earns rather than set by category and hoped
 * for. `shareOfMargin` is how much of the net contribution is given back —
 * 0.3 means the user gets 30% and 70% is retained.
 */
export function sustainableCashbackRate(
  economicsBeforeRewards: UnitEconomics,
  shareOfMargin = 0.3
): number {
  const { amount, revenue, costs } = economicsBeforeRewards;
  if (amount <= 0) return 0;

  const marginBeforeRewards = revenue.total - (costs.total - costs.rewards);
  if (marginBeforeRewards <= 0) return 0;

  return Math.max(0, (marginBeforeRewards * shareOfMargin) / amount);
}

/**
 * Payment volume at which a fixed monthly cost base is covered, given the
 * average contribution per payment.
 */
export function breakEvenPayments(
  monthlyFixedCosts: number,
  averageContribution: number
): number {
  if (averageContribution <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(monthlyFixedCosts / averageContribution);
}

/** Aggregate contribution across a set of payments. */
export function blendedEconomics(items: UnitEconomics[]): {
  payments: number;
  volume: number;
  revenue: number;
  costs: number;
  contribution: number;
  marginRate: number;
  lossMakingShare: number;
} {
  const volume = items.reduce((sum, item) => sum + item.amount, 0);
  const revenue = items.reduce((sum, item) => sum + item.revenue.total, 0);
  const costs = items.reduce((sum, item) => sum + item.costs.total, 0);
  const contribution = revenue - costs;
  const lossMaking = items.filter((item) => !item.profitable).length;

  return {
    payments: items.length,
    volume: roundCurrency(volume, 'NGN'),
    revenue: roundCurrency(revenue, 'NGN'),
    costs: roundCurrency(costs, 'NGN'),
    contribution: roundCurrency(contribution, 'NGN'),
    marginRate: volume > 0 ? contribution / volume : 0,
    lossMakingShare: items.length > 0 ? lossMaking / items.length : 0,
  };
}
