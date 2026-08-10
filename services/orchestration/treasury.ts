import type { CurrencyCode, PaymentSource } from '@/types/payment';
import { DEFAULT_RELIABILITY } from '@/types/payment';
import type { FundingPlan } from '@/types/orchestration';
import { Treasury as Limits } from '@/constants/config';
import { roundCurrency } from '@/services/money';

/**
 * Settlement float and collection risk (§7 "Reserve/float management").
 *
 * ## Why this exists
 *
 * §5.4's atomicity comes from hold-then-capture. That primitive requires a rail
 * that can *authorise* without moving money — and Nigerian bank rails cannot.
 * NIBSS NIP is a push transfer; a direct-debit mandate is a pull. Neither has
 * an authorisation step to hold against. So for the launch corridor, the whole
 * MVP, the hold is unavailable.
 *
 * The float supplies the atomicity instead. Lenz pays the payee in a single
 * indivisible operation, then collects from the user's accounts afterwards.
 * The payee is never exposed to a partial waterfall, and neither is the user.
 *
 * ## What that costs
 *
 * It converts the user's partial-charge risk into Lenz's collection risk. That
 * is the right trade — a failed collection is a business cost that can be
 * priced, retried, and bounded, whereas a user charged across three accounts
 * for a payment that never landed is an unrecoverable trust failure. But it is
 * only the right trade while the exposure is *bounded*, which is this class's
 * entire job.
 *
 * ## What it is not
 *
 * This is not credit. Float is only fronted when the planner has already proven
 * the user's own linked balances cover the payment. Lenz is bridging a
 * settlement-timing gap of seconds-to-hours, not lending money the user
 * doesn't have.
 */

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

export interface FloatExposure {
  transactionId: string;
  userId: string;
  amount: number;
  currency: CurrencyCode;
  openedAt: number;
  /** Collected so far, in settlement currency. */
  recovered: number;
  attempts: number;
  status: 'open' | 'settled' | 'escalated';
}

export type FrontDecision =
  | { allowed: true; confidence: number }
  | { allowed: false; reason: FrontRefusalReason; detail: string; confidence: number };

export type FrontRefusalReason =
  | 'float_disabled'
  | 'transaction_limit'
  | 'user_limit'
  | 'global_limit'
  | 'low_confidence';

export interface TreasuryLimits {
  perTransactionNGN: number;
  perUserOutstandingNGN: number;
  globalOutstandingNGN: number;
  minCollectionConfidence: number;
  balanceFreshnessMs: number;
  collectionRetryLimit: number;
  floatEnabled: boolean;
}

const DEFAULT_LIMITS: TreasuryLimits = {
  floatEnabled: Limits.floatEnabled,
  perTransactionNGN: Limits.perTransactionNGN,
  perUserOutstandingNGN: Limits.perUserOutstandingNGN,
  globalOutstandingNGN: Limits.globalOutstandingNGN,
  minCollectionConfidence: Limits.minCollectionConfidence,
  balanceFreshnessMs: Limits.balanceFreshnessMs,
  collectionRetryLimit: Limits.collectionRetryLimit,
};

// ---------------------------------------------------------------------------
// Collection confidence
// ---------------------------------------------------------------------------

/**
 * How likely every leg of this plan is to collect, 0..1.
 *
 * Deliberately the **product** of per-leg confidence, not the average: a
 * waterfall only fully collects if *every* leg collects, so one flaky account
 * should drag the whole plan down rather than being averaged away by three good
 * ones.
 *
 * Each leg is scored on two things — the provider's historical reliability, and
 * whether the balance we planned against is fresh enough to still be true. A
 * stale balance is the main way a "covered" payment turns into a failed
 * collection, because the user may have spent the money elsewhere in between.
 */
export function collectionConfidence(
  plan: FundingPlan,
  now: number,
  freshnessMs = DEFAULT_LIMITS.balanceFreshnessMs
): number {
  if (plan.legs.length === 0) return 0;

  return plan.legs.reduce((confidence, leg) => {
    const reliability = leg.source.reliability ?? DEFAULT_RELIABILITY;
    return confidence * reliability * freshnessFactor(leg.source, now, freshnessMs);
  }, 1);
}

/**
 * Balance staleness, as a multiplier. Full credit inside the freshness window,
 * then decaying to a floor rather than to zero — a stale balance is a weaker
 * signal, not a worthless one.
 */
function freshnessFactor(source: PaymentSource, now: number, freshnessMs: number): number {
  const age = now - source.lastSynced.getTime();
  if (age <= freshnessMs) return 1;

  const staleness = Math.min(1, (age - freshnessMs) / (freshnessMs * 10));
  return 1 - 0.15 * staleness;
}

// ---------------------------------------------------------------------------
// Treasury
// ---------------------------------------------------------------------------

export class Treasury {
  private readonly limits: TreasuryLimits;
  private readonly exposures = new Map<string, FloatExposure>();

  constructor(limits: Partial<TreasuryLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /**
   * May the float front this payment? Checked *before* the payee is paid, so a
   * refusal costs nothing and the caller can fall back to another strategy.
   */
  canFront(input: {
    userId: string;
    plan: FundingPlan;
    now: number;
  }): FrontDecision {
    const { userId, plan, now } = input;
    const confidence = collectionConfidence(plan, now, this.limits.balanceFreshnessMs);

    if (!this.limits.floatEnabled) {
      return refuse('float_disabled', 'Settlement float is disabled.', confidence);
    }

    if (plan.amount > this.limits.perTransactionNGN) {
      return refuse(
        'transaction_limit',
        `Above the ₦${this.limits.perTransactionNGN.toLocaleString()} float limit for a single payment.`,
        confidence
      );
    }

    const userOutstanding = this.outstandingFor(userId);
    if (userOutstanding + plan.amount > this.limits.perUserOutstandingNGN) {
      return refuse(
        'user_limit',
        'You have too many payments still settling. Try again shortly.',
        confidence
      );
    }

    if (this.totalOutstanding() + plan.amount > this.limits.globalOutstandingNGN) {
      return refuse(
        'global_limit',
        'Settlement capacity is temporarily exhausted.',
        confidence
      );
    }

    if (confidence < this.limits.minCollectionConfidence) {
      return refuse(
        'low_confidence',
        'Your account balances need re-checking before we can send this.',
        confidence
      );
    }

    return { allowed: true, confidence };
  }

  /** Record that float has been committed against a payment. */
  open(input: {
    transactionId: string;
    userId: string;
    amount: number;
    currency: CurrencyCode;
    now: number;
  }): FloatExposure {
    const exposure: FloatExposure = {
      transactionId: input.transactionId,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      openedAt: input.now,
      recovered: 0,
      attempts: 0,
      status: 'open',
    };
    this.exposures.set(input.transactionId, exposure);
    return exposure;
  }

  /** Book a successful collection against an open exposure. */
  recover(transactionId: string, amount: number): void {
    const exposure = this.exposures.get(transactionId);
    if (!exposure) return;

    exposure.recovered = roundCurrency(exposure.recovered + amount, exposure.currency);
    exposure.attempts += 1;

    if (exposure.recovered >= exposure.amount - 1e-9) {
      exposure.status = 'settled';
    }
  }

  /** Note a failed collection attempt; escalates once retries are exhausted. */
  recordFailedCollection(transactionId: string): void {
    const exposure = this.exposures.get(transactionId);
    if (!exposure) return;

    exposure.attempts += 1;
    if (exposure.attempts >= this.limits.collectionRetryLimit) {
      exposure.status = 'escalated';
    }
  }

  /** Release an exposure that never actually fronted anything. */
  cancel(transactionId: string): void {
    this.exposures.delete(transactionId);
  }

  exposureFor(transactionId: string): FloatExposure | undefined {
    return this.exposures.get(transactionId);
  }

  /** Uncollected float owed by one user. */
  outstandingFor(userId: string): number {
    let total = 0;
    for (const exposure of this.exposures.values()) {
      if (exposure.userId !== userId || exposure.status === 'settled') continue;
      total += exposure.amount - exposure.recovered;
    }
    return total;
  }

  /** Uncollected float across every user — the number treasury watches. */
  totalOutstanding(): number {
    let total = 0;
    for (const exposure of this.exposures.values()) {
      if (exposure.status === 'settled') continue;
      total += exposure.amount - exposure.recovered;
    }
    return total;
  }

  /** Exposures that exhausted their retries and need manual recovery. */
  escalated(): FloatExposure[] {
    return [...this.exposures.values()].filter((e) => e.status === 'escalated');
  }
}

function refuse(
  reason: FrontRefusalReason,
  detail: string,
  confidence: number
): FrontDecision {
  return { allowed: false, reason, detail, confidence };
}

/** Process-wide treasury for the dev/mock build. */
export const treasury = new Treasury();
