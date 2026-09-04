import type { PaymentSource } from '@/types/payment';
import type {
  FundingPlan,
  GuaranteeKind,
  LockedPlan,
  PreparedLeg,
  PrepareFailureReason,
  PrepareResult,
  SourceCapabilities,
} from '@/types/orchestration';
import { Treasury as TreasuryConfig } from '@/constants/config';
import { refreshExpiredQuotes } from './executor';
import type { RateFeed } from './fx';
import { nextId } from './ids';
import type { Treasury } from './treasury';
import { DEFAULT_HOLD_TTL_MS, type RailRegistry } from './rails';
import {
  capabilityRegistry,
  guaranteeFor,
  spendableBalance,
  weakestGuarantee,
  type CapabilityRegistry,
} from './capabilities';

/**
 * `prepare()` — the stage between planning and execution.
 *
 * `plan()` must stay pure: it runs on every amount keystroke to keep the
 * preview live, and a planner that preauthorises a card as a side effect of
 * being *rendered* would place real holds on a user's account while they were
 * still typing. But a plan built purely from cached balances is an estimate,
 * and the product promises the confirmation screen is not an estimate.
 *
 * This is where those two requirements are reconciled. Everything with an
 * external effect happens here, once, after the user has expressed intent and
 * before they commit:
 *
 *   - re-validate and re-lock FX quotes
 *   - place real authorisations where the rail supports them (cards)
 *   - ring-fence funds where we control the account (custody, FX partner)
 *   - confirm a standing on-chain allowance covers the leg
 *   - re-read balances on rails that can offer nothing better
 *   - obtain float authorisation for whatever remains unprotected
 *
 * The output is a `LockedPlan`: immutable, per-leg guarantees attached, and
 * the only object `execute()` is allowed to read. That is what preserves the
 * property the original two-verb design had and must not lose — **the thing
 * the user confirms is the thing the executor executes** — while allowing the
 * figures on the confirmation screen to be genuinely committed rather than
 * merely predicted.
 *
 * Failure at any point rolls back every authorisation already placed. A
 * prepare that fails must leave no holds behind; the user's money is untouched
 * and retrying is safe.
 */

// ---------------------------------------------------------------------------
// Balance verification
// ---------------------------------------------------------------------------

export type BalanceReading =
  | { ok: true; balance: number; observedAt: number }
  | { ok: false; reason: string };

export type SufficiencyReading =
  | { ok: true; sufficient: boolean; observedAt: number }
  | { ok: false; reason: string };

/**
 * Live balance access, injected rather than imported so the engine stays
 * independent of which aggregator is wired in.
 *
 * `sufficient` is the more interesting verb and is preferred when a provider
 * offers it: asking "can this account provide ₦37,500?" discloses strictly
 * less than reading the balance, and it is the only question planning needs
 * answered. A provider that can only read balances omits it.
 */
export interface BalanceProvider {
  read(source: PaymentSource): Promise<BalanceReading>;
  sufficient?(source: PaymentSource, amountInSourceCurrency: number): Promise<SufficiencyReading>;
}

export interface PrepareDeps {
  rails: RailRegistry;
  feed: RateFeed;
  treasury: Treasury;
  capabilities?: CapabilityRegistry;
  /**
   * Absent means "trust the balances the plan was built from". Acceptable in
   * development; in production a float-backed leg without a fresh balance read
   * is an unverified credit decision.
   */
  balances?: BalanceProvider;
  holdTtlMs?: number;
  now?: () => number;
}

export interface PrepareParams {
  plan: FundingPlan;
  userId: string;
  /** Scopes every authorisation, so a retry re-uses rather than re-places. */
  idempotencyKey: string;
}

// ---------------------------------------------------------------------------
// prepare
// ---------------------------------------------------------------------------

export async function preparePlan(
  params: PrepareParams,
  deps: PrepareDeps
): Promise<PrepareResult> {
  const now = deps.now ?? Date.now;
  const registry = deps.capabilities ?? capabilityRegistry;
  const ttlMs = deps.holdTtlMs ?? DEFAULT_HOLD_TTL_MS;
  const at = now();

  // ---- 1. Rate locks (§5.5) ---------------------------------------------
  // Re-quote before authorising anything: a hold placed against a stale rate
  // would be for the wrong amount, and releasing it costs the user a pending
  // debit on their statement for no reason.
  const refreshed = refreshExpiredQuotes(params.plan, deps.feed, at);
  if (!refreshed.ok) {
    return failure('rate_expired', refreshed.reason, [], true);
  }
  const plan = refreshed.plan;

  const prepared: PreparedLeg[] = [];

  // ---- 2. Per-leg authorisation -----------------------------------------
  for (const leg of plan.legs) {
    const capabilities = registry.resolve(leg.source);
    const guarantee = guaranteeFor(capabilities);

    if (!capabilities.debitSupported) {
      return abort(
        'capability_missing',
        `${leg.source.label} cannot be debited.`,
        prepared,
        params,
        deps
      );
    }

    const base: PreparedLeg = {
      ...leg,
      guarantee,
      capabilities,
      verifiedBalance: null,
      verifiedAt: null,
    };

    if (guarantee === 'PREAUTHORIZED' || guarantee === 'RESERVED') {
      const rail = deps.rails.resolve(leg.source);
      const held = await rail.hold({
        legId: leg.id,
        source: leg.source,
        amountInSourceCurrency: leg.amountInSourceCurrency,
        currency: leg.sourceCurrency,
        idempotencyKey: `${params.idempotencyKey}:prep:${leg.id}`,
        ttlMs,
      });

      if (!held.ok) {
        const reason: PrepareFailureReason =
          guarantee === 'PREAUTHORIZED' ? 'authorization_declined' : 'reserve_failed';
        return abort(reason, held.reason, prepared, params, deps);
      }

      prepared.push({
        ...base,
        status: 'held',
        holdRef: held.holdRef,
        authorizationRef: held.holdRef,
        authorizationExpiresAt: held.expiresAt,
        // A card discloses no balance, but an accepted authorisation *is* the
        // verification — it proves the funds existed at this instant more
        // firmly than any balance read could.
        verifiedBalance: capabilities.balanceVisibility === 'none' ? null : spendableBalance(leg.source),
        verifiedAt: at,
      });
      continue;
    }

    if (guarantee === 'SIGNED') {
      const authorized = checkDelegatedSpend(capabilities, leg.amountInSourceCurrency);
      if (!authorized.ok) {
        return abort('signature_required', authorized.reason, prepared, params, deps);
      }
      prepared.push({
        ...base,
        verifiedBalance: spendableBalance(leg.source),
        verifiedAt: leg.source.lastSynced.getTime(),
      });
      continue;
    }

    // ---- FLOAT_BACKED — nothing can be locked, so verify instead ---------
    const verification = await verifyBalance(leg.source, leg.amountInSourceCurrency, capabilities, deps, at);
    if (!verification.ok) {
      return abort('balance_moved', verification.reason, prepared, params, deps);
    }

    prepared.push({
      ...base,
      verifiedBalance: verification.balance,
      verifiedAt: verification.observedAt,
    });
  }

  // ---- 3. Float authorisation for whatever stayed unprotected -----------
  const floatBacked = prepared.filter((leg) => leg.guarantee === 'FLOAT_BACKED');
  if (floatBacked.length > 0) {
    // Score the float decision on the legs that actually need it. Charging the
    // treasury for legs a card or custody account already guaranteed would
    // consume exposure headroom against a risk that isn't there.
    const exposedPlan: FundingPlan = {
      ...plan,
      legs: floatBacked,
      amount: sum(floatBacked.map((leg) => leg.amountInSettlementCurrency)),
    };

    const decision = deps.treasury.canFront({
      userId: params.userId,
      plan: exposedPlan,
      now: at,
    });

    if (!decision.allowed) {
      return abort('float_refused', decision.detail, prepared, params, deps);
    }
  }

  return {
    ok: true,
    locked: lock(plan, prepared, at),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lock(plan: FundingPlan, legs: PreparedLeg[], at: number): LockedPlan {
  const guarantees = legs.map((leg) => leg.guarantee);
  const weakest = weakestGuarantee(guarantees);

  const expiries = [
    ...legs.map((leg) => leg.quote.expiresAt),
    ...legs.map((leg) => leg.authorizationExpiresAt ?? Number.POSITIVE_INFINITY),
  ].filter((value) => Number.isFinite(value));

  return {
    id: nextId('lock'),
    planId: plan.id,
    kind: plan.kind,
    legs,
    amount: plan.amount,
    currency: plan.currency,
    totalFees: plan.totalFees,
    collectionCost: plan.collectionCost,
    weakestGuarantee: weakest,
    requiresFloat: guarantees.includes('FLOAT_BACKED'),
    expiresAt: expiries.length > 0 ? Math.min(...expiries) : null,
    preparedAt: at,
  };
}

/**
 * A standing allowance is what lets an embedded wallet contribute a leg
 * without interrupting the payment for a signature. Outside its limit, the
 * honest answer is that we need the user — not that the payment failed.
 */
function checkDelegatedSpend(
  capabilities: SourceCapabilities,
  amountInSourceCurrency: number
): { ok: true } | { ok: false; reason: string } {
  if (!capabilities.delegatedSpend) {
    return { ok: false, reason: 'This wallet needs you to approve the transfer.' };
  }
  if (
    capabilities.delegatedLimit !== null &&
    amountInSourceCurrency > capabilities.delegatedLimit
  ) {
    return {
      ok: false,
      reason: 'This payment is above the spending limit you approved for this wallet.',
    };
  }
  return { ok: true };
}

type VerifyOutcome =
  | { ok: true; balance: number | null; observedAt: number }
  | { ok: false; reason: string };

/**
 * Confirm an unlockable source can still cover its leg.
 *
 * Prefers a sufficiency check where the provider offers one — it answers the
 * only question that matters and discloses less doing it. Falls back to a full
 * balance read, and finally to the plan-time figure when no provider is wired.
 */
async function verifyBalance(
  source: PaymentSource,
  required: number,
  capabilities: SourceCapabilities,
  deps: PrepareDeps,
  at: number
): Promise<VerifyOutcome> {
  const provider = deps.balances;

  if (!provider) {
    return { ok: true, balance: spendableBalance(source), observedAt: source.lastSynced.getTime() };
  }

  if (capabilities.balanceVisibility === 'sufficiency_only' && provider.sufficient) {
    const answer = await provider.sufficient(source, required);
    if (!answer.ok) return { ok: false, reason: answer.reason };
    if (!answer.sufficient) {
      return { ok: false, reason: `${source.label} can no longer cover its share.` };
    }
    // Deliberately null: the provider confirmed sufficiency without disclosing
    // a figure, and inventing one here would misrepresent what we know.
    return { ok: true, balance: null, observedAt: answer.observedAt };
  }

  const reading = await provider.read(source);
  if (!reading.ok) return { ok: false, reason: reading.reason };
  if (reading.balance < required) {
    return { ok: false, reason: `${source.label} can no longer cover its share.` };
  }
  return { ok: true, balance: reading.balance, observedAt: reading.observedAt };
}

/**
 * Release everything already authorised, then report the failure.
 *
 * A prepare that fails must leave nothing held. Anything still authorised
 * would sit against the user's balance until the rail's TTL expired — money
 * they cannot spend, for a payment that never happened.
 */
async function abort(
  reason: PrepareFailureReason,
  message: string,
  placed: PreparedLeg[],
  params: PrepareParams,
  deps: PrepareDeps
): Promise<PrepareResult> {
  const released: PreparedLeg[] = [];
  let allReleased = true;

  for (const leg of placed) {
    if (!leg.authorizationRef) continue;

    const rail = deps.rails.resolve(leg.source);
    const outcome = await rail.release({
      legId: leg.id,
      source: leg.source,
      holdRef: leg.authorizationRef,
      idempotencyKey: `${params.idempotencyKey}:rel:${leg.id}`,
    });

    if (outcome.ok) {
      released.push({ ...leg, status: 'released' });
    } else {
      allReleased = false;
      released.push({ ...leg, status: 'held', failureReason: outcome.reason });
    }
  }

  return failure(reason, message, released, allReleased);
}

function failure(
  reason: PrepareFailureReason,
  message: string,
  releasedLegs: PreparedLeg[],
  fullyRolledBack: boolean
): PrepareResult {
  return { ok: false, reason, message, releasedLegs, fullyRolledBack };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// ---------------------------------------------------------------------------
// Abandoning a locked plan
// ---------------------------------------------------------------------------

export interface ReleaseOutcome {
  released: number;
  /** True when every authorisation was given back. */
  fullyReleased: boolean;
  failures: { legId: string; sourceLabel: string; reason: string }[];
}

/**
 * Give back everything a locked plan is holding.
 *
 * `prepare()` runs when the user reaches the confirmation screen, which means
 * real authorisations exist *before* they authenticate. If they then cancel,
 * back out, or let the screen go, those holds must not be left sitting against
 * their balance until the rail's TTL expires — that is money they cannot spend,
 * for a payment they explicitly declined.
 *
 * Idempotent: releasing an already-released authorisation is a success, so
 * this is safe to call from an unmount handler that may fire more than once.
 */
export async function releaseLockedPlan(
  locked: LockedPlan,
  deps: Pick<PrepareDeps, 'rails'>,
  idempotencyKey: string
): Promise<ReleaseOutcome> {
  const failures: ReleaseOutcome['failures'] = [];
  let released = 0;

  for (const leg of locked.legs) {
    if (!leg.authorizationRef) continue;

    const outcome = await deps.rails.resolve(leg.source).release({
      legId: leg.id,
      source: leg.source,
      holdRef: leg.authorizationRef,
      idempotencyKey: `${idempotencyKey}:abandon:${leg.id}`,
    });

    if (outcome.ok) {
      released += 1;
    } else {
      failures.push({
        legId: leg.id,
        sourceLabel: leg.source.label,
        reason: outcome.reason,
      });
    }
  }

  return { released, fullyReleased: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Locked plan helpers
// ---------------------------------------------------------------------------

/** A locked plan is only good until its earliest quote or authorisation lapses. */
export function lockedPlanExpired(locked: LockedPlan, now = Date.now()): boolean {
  return locked.expiresAt !== null && now >= locked.expiresAt;
}

/** Back to a plain `FundingPlan`, for the executor and the ledger. */
export function toFundingPlan(locked: LockedPlan): FundingPlan {
  return {
    id: locked.planId,
    kind: locked.kind,
    legs: locked.legs,
    amount: locked.amount,
    currency: locked.currency,
    totalFees: locked.totalFees,
    collectionCost: locked.collectionCost,
    expiresAt: locked.expiresAt,
    createdAt: locked.preparedAt,
  };
}

/**
 * Human-readable guarantee, for the confirmation screen.
 *
 * Users are entitled to know which of their accounts is actually committed and
 * which is merely expected to pay — that difference is what determines whether
 * a failure lands on them or on Lenz.
 */
export function describeGuarantee(guarantee: GuaranteeKind): string {
  switch (guarantee) {
    case 'PREAUTHORIZED':
      return 'Held on your card';
    case 'RESERVED':
      return 'Reserved';
    case 'SIGNED':
      return 'Approved to send';
    case 'FLOAT_BACKED':
      return 'Covered by Lenz';
  }
}

/** Treasury exposure this locked plan will actually open. */
export function floatExposureOf(locked: LockedPlan): number {
  return sum(
    locked.legs
      .filter((leg) => leg.guarantee === 'FLOAT_BACKED')
      .map((leg) => leg.amountInSettlementCurrency)
  );
}
