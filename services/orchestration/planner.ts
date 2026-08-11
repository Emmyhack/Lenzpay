import type { CurrencyCode, PaymentSource } from '@/types/payment';
import type {
  FundingLeg,
  FundingPlan,
  PlanFailure,
  PlanResult,
  RankedSource,
} from '@/types/orchestration';
import { Orchestration } from '@/constants/config';
import { floorCurrency, roundCurrency, sumAmounts } from '@/services/money';
import { fromSettlement, legFee, type RateFeed } from './fx';
import { minimumViableLeg, planCollectionCost } from './costs';
import { partitionByReserve, rankSources, totalAvailable } from './ranking';
import { nextId } from './ids';

/**
 * The waterfall planner (§5.3, §5.4) — the "scrape".
 *
 * Builds, but never executes, a funding plan. Keeping planning pure and
 * side-effect free is what lets the app show the user an exact preview
 * (per-account amounts, FX rates, fees) that is the *same object* the executor
 * later runs. No re-derivation between preview and execution means no drift
 * between what was confirmed and what was charged.
 *
 * Precedence, resolving §5.2's reserve rule against §5.3's single-source rule:
 *
 *   1. single non-reserve source that covers the full amount   ← fast path
 *   2. waterfall across non-reserve sources
 *   3. single reserve source that covers the full amount
 *   4. waterfall across everything, reserves last
 *
 * Reserve intent beats the single-source preference: a user who marked an
 * account "reserve" would rather have a 2-leg split of their spending money
 * than a clean 1-leg hit on their emergency fund.
 */

export interface PlanOptions {
  now?: number;
  lockWindowMs?: number;
  /** Force a specific source (Manual mode). Bypasses ranking for selection. */
  preferredSourceId?: string;
  maxLegs?: number;
  /** Rewards-tier FX spread waiver, 0..1 — a real discount, not a label. */
  spreadDiscount?: number;
}

export function planPayment(
  sources: PaymentSource[],
  amount: number,
  currency: CurrencyCode,
  feed: RateFeed,
  options: PlanOptions = {}
): PlanResult {
  const now = options.now ?? Date.now();
  const maxLegs = options.maxLegs ?? Orchestration.maxWaterfallLegs;

  const roundedAmount = roundCurrency(amount, currency);
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    return failure('invalid_amount', roundedAmount, currency, [], 0);
  }

  const ranked = rankSources(sources, roundedAmount, currency, feed, {
    now,
    lockWindowMs: options.lockWindowMs,
    spreadDiscount: options.spreadDiscount,
  });
  const eligible = ranked.filter((entry) => entry.eligible);

  if (eligible.length === 0) {
    return failure('no_eligible_sources', roundedAmount, currency, ranked, 0);
  }

  const available = totalAvailable(ranked);

  // ---- Manual override (§5.1) -------------------------------------------
  // The user picked a source explicitly. Honour it if it can carry the whole
  // payment; otherwise fall through to the automatic path rather than
  // silently building a waterfall they didn't ask for.
  if (options.preferredSourceId) {
    const chosen = eligible.find((entry) => entry.source.id === options.preferredSourceId);
    if (chosen?.coversFull) {
      return success(
        buildPlan('single_source', [chosen], roundedAmount, currency, now),
        ranked,
        available
      );
    }
  }

  // ---- Step 2 — total feasibility check, before anything is held (§5.4) --
  if (available < roundedAmount) {
    return failure(
      'insufficient_funds',
      roundedAmount,
      currency,
      ranked,
      available,
      roundCurrency(roundedAmount - available, currency)
    );
  }

  const { preferred, reserve } = partitionByReserve(eligible);

  // ---- Step 1 — single-source fast path, non-reserve first (§5.3) --------
  const preferredSingle = preferred.find((entry) => entry.coversFull);
  if (preferredSingle) {
    return success(
      buildPlan('single_source', [preferredSingle], roundedAmount, currency, now),
      ranked,
      available
    );
  }

  // ---- Step 3 — waterfall across non-reserve sources ---------------------
  const preferredContributors = selectContributors(preferred, roundedAmount, maxLegs, currency);
  if (preferredContributors) {
    return success(
      buildPlan('waterfall', preferredContributors, roundedAmount, currency, now),
      ranked,
      available
    );
  }

  // ---- Reserves are now in play -----------------------------------------
  const reserveSingle = reserve.find((entry) => entry.coversFull);
  if (reserveSingle) {
    return success(
      buildPlan('single_source', [reserveSingle], roundedAmount, currency, now),
      ranked,
      available
    );
  }

  const allContributors = selectContributors(
    [...preferred, ...reserve],
    roundedAmount,
    maxLegs,
    currency
  );
  if (!allContributors) {
    // Funds exist but can't be assembled inside the leg cap — say so plainly
    // instead of reporting a shortfall the user doesn't actually have.
    return failure('exceeds_leg_limit', roundedAmount, currency, ranked, available, 0);
  }

  return success(
    buildPlan('waterfall', allContributors, roundedAmount, currency, now),
    ranked,
    available
  );
}

/**
 * Choose which accounts contribute, honouring the leg cap.
 *
 * Greedy-by-rank first, because rank encodes user preference and cost. If the
 * top `maxLegs` by rank can't cover the amount, fall back to the `maxLegs`
 * *deepest* accounts — that maximises coverage within the cap, and preserves
 * the product promise that a payment succeeds whenever total funds allow. The
 * fallback set is re-sorted back into rank order so the debit sequence still
 * follows the user's preferences.
 */
function selectContributors(
  candidates: RankedSource[],
  amount: number,
  maxLegs: number,
  currency: CurrencyCode
): RankedSource[] | null {
  if (candidates.length === 0) return null;

  // Prefer legs that clear their own debit fee — a source whose whole balance
  // is worth less than the cost of pulling it burns money and adds a failure
  // point.
  const economic = candidates.filter(
    (entry) =>
      entry.normalizedBalance >=
      minimumViableLeg(entry.source, Orchestration.minLegCostRatio, currency)
  );

  if (economic.length > 0) {
    const fromEconomic = pickCovering(economic, amount, maxLegs);
    if (fromEconomic) return fromEconomic;
  }

  // Cost optimisation never overrides the product promise. If the economic
  // subset can't cover the payment but the full set can, use the full set —
  // a payment the user can afford must not fail because one leg is small.
  return pickCovering(candidates, amount, maxLegs);
}

/** Greedy by rank, falling back to the deepest accounts within the cap. */
function pickCovering(
  pool: RankedSource[],
  amount: number,
  maxLegs: number
): RankedSource[] | null {
  const byRank: RankedSource[] = [];
  let covered = 0;
  for (const entry of pool) {
    if (covered >= amount || byRank.length >= maxLegs) break;
    byRank.push(entry);
    covered += entry.normalizedBalance;
  }
  if (covered >= amount) return byRank;

  const deepest = [...pool]
    .sort((a, b) => b.normalizedBalance - a.normalizedBalance)
    .slice(0, maxLegs);
  const deepestTotal = deepest.reduce((sum, entry) => sum + entry.normalizedBalance, 0);
  if (deepestTotal < amount) return null;

  const order = new Map(pool.map((entry, index) => [entry.source.id, index]));
  return deepest.sort(
    (a, b) => (order.get(a.source.id) ?? 0) - (order.get(b.source.id) ?? 0)
  );
}

/**
 * Turn chosen contributors into concrete legs.
 *
 * Two invariants this function is responsible for:
 *  - legs sum to *exactly* the amount owed (the final leg absorbs rounding
 *    residue), so the receipt reconciles to the kobo;
 *  - no leg debits more than its source actually holds.
 */
function buildPlan(
  kind: FundingPlan['kind'],
  contributors: RankedSource[],
  amount: number,
  currency: CurrencyCode,
  now: number
): FundingPlan {
  const legs: FundingLeg[] = [];
  let remaining = amount;

  contributors.forEach((entry, index) => {
    if (remaining <= 0) return;

    const isLast = index === contributors.length - 1;
    // The last contributor takes whatever is left, so rounding residue from
    // earlier legs can never leave the payee short by a kobo.
    const contribution = isLast
      ? roundCurrency(remaining, currency)
      : roundCurrency(Math.min(entry.normalizedBalance, remaining), currency);

    // No cost-based skipping here. Viability was decided during selection,
    // where coverage could still be guaranteed; by this point every remaining
    // contributor is load-bearing, and dropping one would leave the final leg
    // owing more than its source holds.
    if (!isLast && contribution < Orchestration.minLegAmount) return;

    const required = fromSettlement(entry.quote, contribution);
    const amountInSourceCurrency = Math.min(required, entry.source.rawBalance);

    legs.push({
      id: nextId('leg'),
      sourceId: entry.source.id,
      source: entry.source,
      amountInSourceCurrency,
      sourceCurrency: entry.source.rawCurrency,
      amountInSettlementCurrency: contribution,
      settlementCurrency: currency,
      feeInSettlementCurrency: legFee(entry.quote, amountInSourceCurrency, contribution),
      quote: entry.quote,
      status: 'planned',
    });

    remaining = roundCurrency(remaining - contribution, currency);
  });

  const expiries = legs
    .map((leg) => leg.quote.expiresAt)
    .filter((value) => Number.isFinite(value));

  return {
    id: nextId('plan'),
    kind,
    legs,
    amount,
    currency,
    totalFees: sumAmounts(
      legs.map((leg) => leg.feeInSettlementCurrency),
      currency
    ),
    // What it will cost to pull these legs in, before any netting.
    collectionCost: planCollectionCost(legs, currency),
    expiresAt: expiries.length > 0 ? Math.min(...expiries) : null,
    createdAt: now,
  };
}

function success(
  plan: FundingPlan,
  ranked: RankedSource[],
  available: number
): PlanResult {
  return { ok: true, plan, ranked, totalAvailable: available };
}

function failure(
  reason: PlanFailure['reason'],
  amount: number,
  currency: CurrencyCode,
  ranked: RankedSource[],
  available: number,
  shortfall = amount
): PlanFailure {
  return {
    ok: false,
    reason,
    shortfall: floorCurrency(Math.max(0, shortfall), currency),
    totalAvailable: available,
    amount,
    currency,
    ranked,
  };
}

// ---------------------------------------------------------------------------
// Plan inspection helpers (used by the UI and by tests)
// ---------------------------------------------------------------------------

/** Does the plan's per-leg arithmetic actually add up to the amount owed? */
export function planBalances(plan: FundingPlan): boolean {
  const total = sumAmounts(
    plan.legs.map((leg) => leg.amountInSettlementCurrency),
    plan.currency
  );
  return total === roundCurrency(plan.amount, plan.currency);
}

export function planIsExpired(plan: FundingPlan, now = Date.now()): boolean {
  return plan.expiresAt !== null && now >= plan.expiresAt;
}

/** True when any leg needs an FX or crypto conversion. */
export function planRequiresConversion(plan: FundingPlan): boolean {
  return plan.legs.some((leg) => leg.sourceCurrency !== leg.settlementCurrency);
}

/**
 * One-line summary for the Auto-mode confirm step (§3.2):
 * "Paying ₦4,500 from USD account (auto-converted)".
 */
export function summarisePlan(plan: FundingPlan): string {
  if (plan.legs.length === 0) return 'No funding sources selected';

  if (plan.legs.length === 1) {
    const [leg] = plan.legs;
    const converted = leg.sourceCurrency !== leg.settlementCurrency ? ' (auto-converted)' : '';
    return `${leg.source.label}${converted}`;
  }

  return `Split across ${plan.legs.length} sources`;
}
