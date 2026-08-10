import {
  DEFAULT_PRIORITY_WEIGHT,
  DEFAULT_RELIABILITY,
  isCrypto,
  type CurrencyCode,
  type PaymentSource,
} from '@/types/payment';
import type { RankedSource, ScoreBreakdown } from '@/types/orchestration';
import { Orchestration } from '@/constants/config';
import { feeInSettlementCurrency, getQuote, toSettlement, type RateFeed } from './fx';

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

  const ranked = sources.map<RankedSource>((source) => {
    const sourceCurrency = source.rawCurrency;
    const quote = getQuote(sourceCurrency, currency, feed, options);

    const normalizedBalance = toSettlement(quote, source.rawBalance);
    const fee = feeInSettlementCurrency(quote, source.rawBalance);

    const userPriority = (source.priorityWeight ?? DEFAULT_PRIORITY_WEIGHT) / 100;
    const currencyProximity = currencyProximityScore(sourceCurrency, currency);
    const conversionCost = conversionCostScore(fee, normalizedBalance);
    const reliability = source.reliability ?? DEFAULT_RELIABILITY;
    const reservePenalty = source.isReserve ? weights.reservePenalty : 0;

    const total =
      userPriority * weights.userPriority +
      currencyProximity * weights.currencyProximity +
      conversionCost * weights.conversionCost +
      reliability * weights.reliability -
      reservePenalty;

    const breakdown: ScoreBreakdown = {
      userPriority,
      currencyProximity,
      conversionCost,
      reliability,
      reservePenalty,
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
