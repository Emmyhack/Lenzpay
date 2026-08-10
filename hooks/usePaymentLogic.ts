import { useMemo } from 'react';
import type { CurrencyCode, PaymentResult, PaymentSource } from '@/types/payment';
import type { FundingPlan, PlanFailureReason, RankedSource } from '@/types/orchestration';
import { paymentEngine, summarisePlan } from '@/services/orchestration';
import { roundCurrency } from '@/services/money';

/**
 * React binding for the Funding Orchestration Engine (§5).
 *
 * The real work lives in `services/orchestration` — deliberately outside the
 * component tree, so it can be unit-tested against deterministic rails and
 * reused by the merchant app and (later) the Lenz Card's backend.
 *
 * This hook keeps the legacy `PaymentResult` shape that `SourceList` and
 * `SplitPreview` already render, and adds the plan itself so screens that need
 * FX rates, fees, or the per-leg breakdown can reach them.
 */

export interface PaymentLogicResult extends PaymentResult {
  /** The executable plan. Pass this straight to the executor — do not rebuild it. */
  plan: FundingPlan | null;
  /** Full ranked list with score breakdowns, for Manual mode and for audit. */
  ranked: RankedSource[];
  failureReason: PlanFailureReason | null;
  /** One-line Auto-mode summary, e.g. "Grey Finance (auto-converted)". */
  summary: string;
  /** Conversion cost across all legs, in settlement currency. */
  totalFees: number;
  /** When the quoted rates stop being honoured (§5.5). Null if no conversion. */
  expiresAt: number | null;
}

const EMPTY: PaymentLogicResult = {
  mode: 'auto',
  plan: null,
  ranked: [],
  failureReason: null,
  summary: '',
  totalFees: 0,
  expiresAt: null,
  totalCoverable: 0,
  deficit: 0,
  isCoverable: false,
};

export function usePaymentLogic(
  amountNGN: number,
  sources: PaymentSource[],
  options: { currency?: CurrencyCode; preferredSourceId?: string } = {}
): PaymentLogicResult {
  const { currency = 'NGN', preferredSourceId } = options;

  return useMemo(() => {
    if (amountNGN <= 0 || sources.length === 0) {
      return { ...EMPTY, deficit: Math.max(0, amountNGN) };
    }

    const result = paymentEngine.plan(sources, amountNGN, currency, { preferredSourceId });

    if (!result.ok) {
      return {
        ...EMPTY,
        mode: result.reason === 'insufficient_funds' ? 'split' : 'auto',
        ranked: result.ranked,
        failureReason: result.reason,
        totalCoverable: roundCurrency(result.totalAvailable, currency),
        deficit: result.shortfall,
        isCoverable: false,
      };
    }

    const { plan, ranked, totalAvailable } = result;
    const isSingle = plan.kind === 'single_source';

    return {
      // 'split' is the legacy name for a waterfall — kept so the existing
      // SourceList/SplitPreview rendering paths keep working unchanged.
      mode: isSingle ? 'auto' : 'split',
      autoSelected: isSingle ? plan.legs[0]?.source : undefined,
      splitAllocations: isSingle
        ? undefined
        : plan.legs.map((leg) => ({
            source: leg.source,
            amount: leg.amountInSettlementCurrency,
          })),
      plan,
      ranked,
      failureReason: null,
      summary: summarisePlan(plan),
      totalFees: plan.totalFees,
      expiresAt: plan.expiresAt,
      totalCoverable: roundCurrency(totalAvailable, currency),
      deficit: 0,
      isCoverable: true,
    };
  }, [amountNGN, sources, currency, preferredSourceId]);
}

/**
 * Message for a plan that couldn't be built. Kept next to the hook so the
 * wording stays consistent wherever a failure surfaces.
 */
export function describePlanFailure(
  reason: PlanFailureReason | null,
  shortfall: number
): string | null {
  switch (reason) {
    case 'insufficient_funds':
      return `You're short by ₦${shortfall.toLocaleString()} across all sources.`;
    case 'exceeds_leg_limit':
      return 'Your balance covers this, but it is spread across too many accounts. Move funds together and try again.';
    case 'no_eligible_sources':
      return 'None of your linked accounts has a usable balance.';
    case 'invalid_amount':
      return 'Enter an amount to continue.';
    default:
      return null;
  }
}
