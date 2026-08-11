import type { FundingPlan, Payee } from '@/types/orchestration';
import type { FraudAlert } from '@/types/security';
import { Orchestration } from '@/constants/config';

/**
 * A waterfall wide enough to be a fraud signal.
 *
 * Derived from the engine's own leg cap rather than hard-coded: a fixed
 * threshold of 5 could never fire once the cap dropped to 2, so the rule was
 * silently dead. "Every account the user has, at once" is the signal — §7 calls
 * out a sudden waterfall across many accounts to a first-time payee as
 * stronger evidence than a single-source payment.
 */
const WIDE_WATERFALL_LEGS = Math.max(2, Orchestration.maxWaterfallLegs);

export interface PaymentRiskInput {
  amountNGN: number;
  payee: Payee;
  plan: FundingPlan;
  perTransactionLimitNGN: number;
  /** Today's ceiling. Enforced against `spentTodayNGN`, not just displayed. */
  dailyLimitNGN: number;
  /** Already spent against today's ceiling, from the persisted spend ledger. */
  spentTodayNGN: number;
  unusualAmountAlertsEnabled: boolean;
}

/** Deterministic, auditable client-side guard. A production backend must run
 * the authoritative risk model again before any rail is touched. */
export function evaluatePaymentRisk(input: PaymentRiskInput): FraudAlert | null {
  const reasons: string[] = [];

  if (input.amountNGN > input.perTransactionLimitNGN) {
    reasons.push(`Amount exceeds your ₦${input.perTransactionLimitNGN.toLocaleString()} per-payment limit`);
  }
  // The daily limit was previously stored and shown but never counted against,
  // so it stopped nothing. A limit that does not bind is worse than no limit —
  // it tells the user they are protected when they are not.
  if (input.spentTodayNGN + input.amountNGN > input.dailyLimitNGN) {
    const remaining = Math.max(0, input.dailyLimitNGN - input.spentTodayNGN);
    reasons.push(
      `This would exceed your ₦${input.dailyLimitNGN.toLocaleString()} daily limit — ₦${remaining.toLocaleString()} left today`
    );
  }
  if (input.unusualAmountAlertsEnabled && input.amountNGN >= 100_000) {
    reasons.push('Amount is unusually high');
  }
  if (input.plan.legs.length >= WIDE_WATERFALL_LEGS) {
    reasons.push(`Payment would draw from ${input.plan.legs.length} funding sources`);
  }
  if (!input.payee.isVerified) {
    reasons.push('Payee is not verified in the Lenz directory');
  }
  if (input.payee.resolutionType === 'crypto_address' && input.plan.legs.some((leg) => leg.source.type !== 'crypto')) {
    reasons.push('New cross-rail crypto payment');
  }

  if (reasons.length === 0) return null;

  return {
    id: `fraud_${Date.now().toString(36)}`,
    amountNGN: input.amountNGN,
    payeeName: input.payee.displayName,
    occurredAt: new Date(),
    reasons,
    // A breached limit blocks outright; anything else needs corroboration.
    blocked: reasons.some((reason) => reason.includes('exceed')) || reasons.length >= 2,
  };
}
