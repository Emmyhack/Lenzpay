import type { CurrencyCode, PaymentSource, SourceType } from '@/types/payment';
import { roundCurrency } from '@/services/money';

/**
 * Rail cost model — what it costs to *move* money, as opposed to convert it.
 *
 * The engine already priced conversion (`fx.ts`). It had no idea what a debit
 * costs, and that omission is expensive in exactly the case the product is
 * built for: a waterfall pays a fixed per-debit fee on *every* leg, so adding a
 * third source to cover a ₦200 shortfall can cost more than the shortfall.
 *
 * Real numbers this is calibrated against (Nigeria, aggregator direct debit):
 * a flat minimum in the ₦50–60 range per debit on small amounts, moving to a
 * percentage with a cap higher up. Verify against your own commercial terms
 * before launch — these are list prices and they are negotiable at volume.
 */

export interface RailCostTerms {
  /** Flat fee per debit, in the source's currency. */
  flatFee: number;
  /** Proportional fee on the debited amount. */
  rate: number;
  /** Ceiling on the proportional part. */
  cap: number;
  /** Below this amount the flat fee applies rather than the rate. */
  flatFeeThreshold: number;
}

/**
 * Published list prices, used until commercial terms are agreed.
 *
 * Bank direct debit is the expensive rail and also the most common, which is
 * what makes leg count matter so much.
 *
 * These are a starting point, not a contract. Aggregator pricing is negotiable
 * at volume and differs per provider, so the model must not bake them in —
 * call `setRailCosts()` with your agreed terms at startup and everything
 * downstream (planning, leg viability, the profit model) re-prices itself.
 */
const LIST_PRICE_RAIL_COSTS: Record<SourceType, RailCostTerms> = {
  bank: { flatFee: 55, rate: 0.01, cap: 1_000, flatFeeThreshold: 20_000 },
  // Wallet providers generally undercut bank direct debit.
  wallet: { flatFee: 25, rate: 0.005, cap: 500, flatFeeThreshold: 20_000 },
  // FX partner debits are priced into the spread; the move itself is cheap.
  usd: { flatFee: 0, rate: 0.001, cap: 500, flatFeeThreshold: 0 },
  // Custody transfers cost network gas, roughly flat per movement.
  crypto: { flatFee: 0, rate: 0.002, cap: 800, flatFeeThreshold: 0 },
};

let activeRailCosts: Record<SourceType, RailCostTerms> = { ...LIST_PRICE_RAIL_COSTS };

/** The pricing currently in force. */
export const RAIL_COSTS: Record<SourceType, RailCostTerms> = new Proxy(
  {} as Record<SourceType, RailCostTerms>,
  {
    get: (_target, prop: string) => activeRailCosts[prop as SourceType],
    ownKeys: () => Reflect.ownKeys(activeRailCosts),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  }
);

/**
 * Replace list prices with negotiated commercial terms. Partial — supply only
 * the rails whose pricing you've agreed.
 */
export function setRailCosts(overrides: Partial<Record<SourceType, Partial<RailCostTerms>>>): void {
  const next = { ...activeRailCosts };
  for (const [type, terms] of Object.entries(overrides)) {
    const key = type as SourceType;
    if (terms) next[key] = { ...next[key], ...terms };
  }
  activeRailCosts = next;
}

/** Restore published list prices. Used by tests. */
export function resetRailCosts(): void {
  activeRailCosts = { ...LIST_PRICE_RAIL_COSTS };
}

/**
 * What it costs to pull `amount` out of this source, in settlement currency.
 *
 * Note this is a *per-debit* cost, so it is charged once per leg per
 * collection — which is precisely why netting collection (see
 * `collections.ts`) is worth more than any amount of ranking cleverness.
 */
export function collectionCost(
  source: PaymentSource,
  amountInSettlement: number,
  currency: CurrencyCode = 'NGN'
): number {
  const terms = activeRailCosts[source.type];
  if (!terms) return 0;

  const cost =
    amountInSettlement <= terms.flatFeeThreshold
      ? terms.flatFee
      : Math.min(amountInSettlement * terms.rate, terms.cap);

  return roundCurrency(cost, currency);
}

/**
 * The smallest contribution that justifies its own collection fee.
 *
 * A leg delivering less than this is worse than useless: it costs more in fees
 * than it moves, and it adds a failure point to the payment. The planner uses
 * this to decide whether a marginal source is worth including at all.
 */
export function minimumViableLeg(
  source: PaymentSource,
  ratio: number,
  currency: CurrencyCode = 'NGN'
): number {
  // Cost at a nominal small amount — the flat-fee band, which is where
  // marginal legs live.
  const cost = collectionCost(source, 1, currency);
  return roundCurrency(cost * ratio, currency);
}

/** Total cost to collect a whole plan, one debit per leg. */
export function planCollectionCost(
  legs: { source: PaymentSource; amountInSettlementCurrency: number }[],
  currency: CurrencyCode = 'NGN'
): number {
  return roundCurrency(
    legs.reduce(
      (sum, leg) => sum + collectionCost(leg.source, leg.amountInSettlementCurrency, currency),
      0
    ),
    currency
  );
}

/**
 * What netting saves: collecting N payments from one account costs one debit
 * instead of N. Exposed so the saving is measurable rather than asserted.
 */
export function nettingSaving(
  debitsBeforeNetting: number,
  debitsAfterNetting: number,
  perDebitCost: number,
  currency: CurrencyCode = 'NGN'
): number {
  return roundCurrency(
    Math.max(0, debitsBeforeNetting - debitsAfterNetting) * perDebitCost,
    currency
  );
}
