import {
  DEFAULT_PRIORITY_WEIGHT,
  DEFAULT_RELIABILITY,
  isCrypto,
  type CurrencyCode,
  type PaymentSource,
} from '@/types/payment';
import type { RankedSource, ScoreBreakdown, SourceCapabilities } from '@/types/orchestration';
import { Orchestration, Treasury as TreasuryConfig } from '@/constants/config';
import { feeInSettlementCurrency, getQuote, toSettlement, type RateFeed } from './fx';
import {
  balanceCertainty,
  capabilityRegistry,
  guaranteeFor,
  guaranteeStrength,
  latencyScore,
  requiresFloat,
  spendableBalance,
  type CapabilityRegistry,
} from './capabilities';

/**
 * Source ranking (§5.2).
 *
 * Every account is scored on five normalised (0..1) terms, weighted by
 * `Orchestration.rankingWeights`, then sorted descending. The same ranking
 * drives both Auto (engine picks the top) and Manual (user sees the list in
 * this order), so what the user is shown always matches what Auto would do.
 *
 * The full per-term breakdown is retained on every ranked source — §6.1
 * requires every orchestration decision to be auditable for dispute
 * resolution, and "why did it pick the USD account?" is exactly that question.
 */

/**
 * How close a source's currency is to the settlement currency, before user
 * preference is applied. Same-currency needs no counterparty at all; fiat FX
 * needs one; crypto needs a liquidity partner *and* an off-ramp.
 */
export function currencyProximityScore(
  sourceCurrency: CurrencyCode,
  settlementCurrency: CurrencyCode
): number {
  if (sourceCurrency === settlementCurrency) return 1;
  if (isCrypto(sourceCurrency)) return sourceCurrency === 'USDT' ? 0.45 : 0.3;
  return 0.65;
}

/**
 * Conversion cost as a 0..1 score where cheaper is better. Cost is measured as
 * a *proportion* of what the source can deliver, so a flat fee correctly looks
 * expensive on a small balance and negligible on a large one.
 */
const MAX_MEANINGFUL_COST_RATIO = 0.05; // 5% — anything worse scores 0.

export function conversionCostScore(fee: number, delivered: number): number {
  if (delivered <= 0) return 0;
  const ratio = fee / delivered;
  return Math.max(0, 1 - Math.min(1, ratio / MAX_MEANINGFUL_COST_RATIO));
}

export interface RankOptions {
  now?: number;
  lockWindowMs?: number;
  /** Rewards-tier FX spread waiver, 0..1. */
  spreadDiscount?: number;
  /** Resolves what each source's rail can do. Defaults to the global registry. */
  capabilities?: CapabilityRegistry;
  /** Balances older than this stop counting as freshly observed. */
  balanceFreshnessMs?: number;
}

/**
 * Score and sort every linked source for a payment of `amount` in `currency`.
 *
 * Note this quotes each non-matching-currency source, so the returned quotes
 * carry a rate lock — the planner must build on these same quote objects
 * rather than re-quoting, or the price shown to the user won't be the price
 * that executes.
 */
export function rankSources(
  sources: PaymentSource[],
  amount: number,
  currency: CurrencyCode,
  feed: RateFeed,
  options: RankOptions = {}
): RankedSource[] {
  const weights = Orchestration.rankingWeights;

  const registry = options.capabilities ?? capabilityRegistry;
  const now = options.now ?? Date.now();
  const freshnessMs = options.balanceFreshnessMs ?? TreasuryConfig.balanceFreshnessMs;

  const ranked = sources.map<RankedSource>((source) => {
    const sourceCurrency = source.rawCurrency;
    const quote = getQuote(sourceCurrency, currency, feed, options);
    const capabilities = registry.resolve(source);

    // Plan against what is actually spendable, never the headline balance.
    // A leg sized off a figure that includes pending debits and required
    // minimums will pass planning and then fail collection.
    const usableBalance = plannableBalance(source, capabilities);

    const normalizedBalance = toSettlement(quote, usableBalance);
    const fee = feeInSettlementCurrency(quote, usableBalance);

    const guarantee = guaranteeFor(capabilities);

    const userPriority = (source.priorityWeight ?? DEFAULT_PRIORITY_WEIGHT) / 100;
    const currencyProximity = currencyProximityScore(sourceCurrency, currency);
    const conversionCost = conversionCostScore(fee, normalizedBalance);
    const reliability = source.reliability ?? DEFAULT_RELIABILITY;
    const reservePenalty = source.isReserve ? weights.reservePenalty : 0;

    const settlementCertainty = guaranteeStrength(guarantee);
    const certaintyOfBalance = balanceCertainty(source, capabilities, now, freshnessMs);
    const railReliability = 1 - Math.min(1, Math.max(0, capabilities.failureRate));
    const latency = latencyScore(capabilities);
    const floatExposurePenalty = requiresFloat(capabilities)
      ? weights.floatExposurePenalty
      : 0;

    const total =
      userPriority * weights.userPriority +
      currencyProximity * weights.currencyProximity +
      conversionCost * weights.conversionCost +
      reliability * weights.reliability +
      settlementCertainty * weights.settlementCertainty +
      certaintyOfBalance * weights.balanceCertainty +
      railReliability * weights.railReliability +
      latency * weights.latency -
      floatExposurePenalty -
      reservePenalty;

    const breakdown: ScoreBreakdown = {
      userPriority,
      currencyProximity,
      conversionCost,
      reliability,
      reservePenalty,
      settlementCertainty,
      balanceCertainty: certaintyOfBalance,
      railReliability,
      latency,
      floatExposurePenalty,
      total,
    };

    return {
      source,
      normalizedBalance,
      eligible: normalizedBalance >= Orchestration.minLegAmount,
      coversFull: normalizedBalance >= amount,
      quote,
      score: total,
      breakdown,
      capabilities,
      guarantee,
    };
  });

  return sortRanked(ranked);
}

/**
 * Sort by score, then by depth (a bigger balance means fewer legs in a
 * waterfall), then by id so the order is stable across renders.
 */
function sortRanked(ranked: RankedSource[]): RankedSource[] {
  return [...ranked].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.normalizedBalance !== a.normalizedBalance) {
      return b.normalizedBalance - a.normalizedBalance;
    }
    return a.source.id.localeCompare(b.source.id);
  });
}

/** Total the user could deliver to this payee across every eligible source. */
export function totalAvailable(ranked: RankedSource[]): number {
  return ranked
    .filter((entry) => entry.eligible)
    .reduce((sum, entry) => sum + entry.normalizedBalance, 0);
}

/**
 * Reserve-aware view used by the waterfall: non-reserve sources first, reserve
 * sources appended in their own ranked order. Reserve funds are already pushed
 * down by the score penalty, but partitioning makes the "only touch reserves
 * when nothing else can cover it" rule explicit rather than emergent from
 * weight tuning.
 */
export function partitionByReserve(ranked: RankedSource[]): {
  preferred: RankedSource[];
  reserve: RankedSource[];
} {
  return {
    preferred: ranked.filter((entry) => !entry.source.isReserve),
    reserve: ranked.filter((entry) => entry.source.isReserve),
  };
}

/**
 * How much of this source the planner is allowed to commit.
 *
 * Three cases, and the third is the one that matters:
 *
 *  - `exact`            — the spendable balance, which is the headline balance
 *                         less pending debits, minimums and known holds.
 *  - `sufficiency_only` — the provider will confirm "can this account provide
 *                         X?" without disclosing a figure. That answers the
 *                         only question planning actually needs, so the source
 *                         is planned at the amount asked for.
 *  - `none`             — a card. Nothing is knowable before authorisation, so
 *                         `rawBalance` is treated as a declared limit and the
 *                         leg is provisional until `prepare()` authorises it.
 *                         `balanceCertainty` scores 0 to make that explicit
 *                         rather than letting an assumed number look verified.
 */
function plannableBalance(
  source: PaymentSource,
  capabilities: SourceCapabilities
): number {
  if (capabilities.balanceVisibility === 'sufficiency_only') {
    // Cap at the declared balance so a sufficiency check can never invent
    // capacity the account was never claimed to have.
    return Math.min(spendableBalance(source), Math.max(source.rawBalance, 0));
  }
  return spendableBalance(source);
}
