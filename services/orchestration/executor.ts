import type {
  ExecutionFailure,
  ExecutionFailureStage,
  ExecutionResult,
  FundingLeg,
  FundingPlan,
  LedgerEntry,
  Payee,
  SettlementStrategy,
} from '@/types/orchestration';
import { Orchestration } from '@/constants/config';
import { roundCurrency, sumAmounts } from '@/services/money';
import { fromSettlement, isQuoteExpired, legFee, requote, type RateFeed } from './fx';
import {
  Ledger,
  floatToPayeePostings,
  legPostings,
  reversalPostings,
  sourceToFloatPostings,
} from './ledger';
import { nextId } from './ids';
import type { IdempotencyStore } from './idempotency';
import { Treasury } from './treasury';
import {
  DEFAULT_HOLD_TTL_MS,
  type RailRegistry,
  type SettlementRail,
} from './rails';

/**
 * Plan execution (§5.4, §5.7).
 *
 * The whole design exists to avoid one specific failure: *"charged 3 accounts,
 * payment still failed."* There are two ways to prevent it, and which one is
 * available depends entirely on what the rails can do.
 *
 * **`hold_then_capture`** — §5.4 as written:
 *   1. re-validate the rate lock, 2. hold every source, 3. capture, 4. settle.
 *   Nothing irreversible happens until step 3, so failures in 1–2 abort with
 *   zero user impact. Requires rails that can authorise without moving money.
 *
 * **`float_fronted`** — for rails that have no authorisation step at all, which
 *   includes every Nigerian bank rail and therefore the entire launch corridor:
 *   1. re-validate the rate lock, 2. check float capacity, 3. pay the payee
 *   from float in one indivisible operation, 4. collect from the user's
 *   accounts afterwards.
 *   The payee is paid once or not at all, and the user is never left with a
 *   half-executed waterfall. A collection that fails is Lenz's exposure to
 *   recover, not a failed payment — see `treasury.ts` for why that trade is
 *   the right one and how the exposure is bounded.
 *
 * The strategy is chosen per plan from the rails involved, not configured
 * globally, so a card leg (which *can* authorise) uses the stronger path even
 * while bank legs don't.
 */

export interface ExecutorDeps {
  rails: RailRegistry;
  settlementRail: SettlementRail;
  ledger: Ledger;
  feed: RateFeed;
  idempotency: IdempotencyStore<ExecutionResult>;
  treasury: Treasury;
  now?: () => number;
}

export interface ExecuteParams {
  plan: FundingPlan;
  payee: Payee;
  idempotencyKey: string;
  userId: string;
  transactionId?: string;
  /** Force a strategy. Tests and the card rail use this; normal flow infers it. */
  strategy?: SettlementStrategy;
}

/**
 * Pick the settlement strategy from what the rails can actually do. Every leg
 * must support a real hold for the stronger path to be safe — one rail that
 * debits outright is enough to reintroduce partial-charge risk.
 */
export function chooseStrategy(plan: FundingPlan, rails: RailRegistry): SettlementStrategy {
  const allSupportHolds = plan.legs.every(
    (leg) => rails.resolve(leg.source).supportsNativeHold
  );
  return allSupportHolds ? 'hold_then_capture' : 'float_fronted';
}

export async function executePlan(
  params: ExecuteParams,
  deps: ExecutorDeps
): Promise<ExecutionResult> {
  const now = deps.now ?? Date.now;
  const { payee, idempotencyKey } = params;
  const transactionId = params.transactionId ?? nextId('txn');
  const initialStrategy = params.strategy ?? chooseStrategy(params.plan, deps.rails);

  // ---- 0. Idempotency gate (§6.1) ---------------------------------------
  const gate = deps.idempotency.begin(idempotencyKey, now());
  if (gate.state === 'replay') return gate.result;
  if (gate.state === 'in_flight') {
    // Not a rollback case — the original attempt still owns the money path.
    // Reporting failure here would be a lie; the caller should poll instead.
    return fail(params.plan, params.plan.legs, {
      transactionId,
      idempotencyKey,
      strategy: initialStrategy,
      stage: 'hold',
      reason: 'A payment with this reference is already being processed.',
      fullyRolledBack: true,
      status: 'failed',
    });
  }

  // Work on a copy so a failed attempt never mutates the plan the UI is
  // rendering from.
  let legs = params.plan.legs.map((leg) => ({ ...leg }));
  let plan: FundingPlan = { ...params.plan, legs };

  // ---- 1. Rate-lock revalidation (§5.5) ---------------------------------
  const refreshed = refreshExpiredQuotes(plan, deps.feed, now());
  if (!refreshed.ok) {
    deps.idempotency.abandon(idempotencyKey); // nothing moved; retry is safe
    return fail(plan, legs, {
      transactionId,
      idempotencyKey,
      strategy: initialStrategy,
      stage: 'rate_expired',
      reason: refreshed.reason,
      fullyRolledBack: true,
      status: 'failed',
    });
  }
  plan = refreshed.plan;
  legs = plan.legs;

  if (initialStrategy === 'float_fronted') {
    return executeFloatFronted(
      { plan, payee, transactionId, idempotencyKey, userId: params.userId },
      deps
    );
  }

  return executeHoldThenCapture(
    { plan, payee, transactionId, idempotencyKey },
    deps
  );
}

// ---------------------------------------------------------------------------
// Strategy A — hold, then capture (§5.4)
// ---------------------------------------------------------------------------

interface StrategyParams {
  plan: FundingPlan;
  payee: Payee;
  transactionId: string;
  idempotencyKey: string;
}

async function executeHoldThenCapture(
  params: StrategyParams,
  deps: ExecutorDeps
): Promise<ExecutionResult> {
  const now = deps.now ?? Date.now;
  const { plan, payee, transactionId, idempotencyKey } = params;
  const legs = plan.legs;
  const strategy: SettlementStrategy = 'hold_then_capture';

  // ---- 2. Hold every source before moving anything (§5.4) ---------------
  const holdOrder = orderForHolding(legs);
  const heldLegs: FundingLeg[] = [];

  for (const leg of holdOrder) {
    const rail = deps.rails.resolve(leg.source);
    const result = await rail.hold({
      legId: leg.id,
      source: leg.source,
      amountInSourceCurrency: leg.amountInSourceCurrency,
      currency: leg.sourceCurrency,
      idempotencyKey: `${idempotencyKey}:hold:${leg.id}`,
      ttlMs: DEFAULT_HOLD_TTL_MS,
    });

    if (!result.ok) {
      leg.status = 'failed';
      leg.failureReason = result.reason;
      const released = await releaseAll(heldLegs, deps, idempotencyKey);
      deps.idempotency.abandon(idempotencyKey); // no capture happened
      return fail(plan, legs, {
        transactionId,
        idempotencyKey,
        strategy,
        stage: 'hold',
        reason: result.reason,
        fullyRolledBack: released,
        status: 'failed',
      });
    }

    leg.status = 'held';
    leg.holdRef = result.holdRef;
    heldLegs.push(leg);
  }

  // ---- 3. Capture, in the order the receipt will show (§5.4) ------------
  const capturedLegs: FundingLeg[] = [];
  const ledgerEntries: LedgerEntry[] = [];

  for (const leg of legs) {
    const rail = deps.rails.resolve(leg.source);
    const result = await rail.capture({
      legId: leg.id,
      source: leg.source,
      holdRef: leg.holdRef!,
      amountInSourceCurrency: leg.amountInSourceCurrency,
      idempotencyKey: `${idempotencyKey}:capture:${leg.id}`,
    });

    if (!result.ok) {
      leg.status = 'failed';
      leg.failureReason = result.reason;
      const outstanding = heldLegs.filter(
        (candidate) => candidate.status === 'held' && candidate.id !== leg.id
      );
      const rolledBack = await rollback(
        capturedLegs,
        outstanding,
        deps,
        transactionId,
        idempotencyKey,
        result.reason
      );
      return fail(plan, legs, {
        transactionId,
        idempotencyKey,
        strategy,
        stage: 'capture',
        reason: result.reason,
        fullyRolledBack: rolledBack,
        status: rolledBack ? 'failed' : 'partially_reversed',
      });
    }

    leg.status = 'captured';
    leg.captureRef = result.captureRef;
    capturedLegs.push(leg);

    // Post the leg as it captures, so the audit trail reflects what actually
    // happened even if a later leg forces a reversal.
    ledgerEntries.push(...deps.ledger.post(transactionId, legPostings(leg, payee), now()));
  }

  // ---- 4. Pay the payee -------------------------------------------------
  const settlement = await deps.settlementRail.settle({
    payee,
    amount: plan.amount,
    currency: plan.currency,
    idempotencyKey: `${idempotencyKey}:settle`,
    legs,
  });

  if (!settlement.ok) {
    const rolledBack = await rollback(
      capturedLegs,
      [],
      deps,
      transactionId,
      idempotencyKey,
      settlement.reason
    );
    return fail(plan, legs, {
      transactionId,
      idempotencyKey,
      strategy,
      stage: 'settlement',
      reason: settlement.reason,
      fullyRolledBack: rolledBack,
      status: rolledBack ? 'failed' : 'partially_reversed',
    });
  }

  const success: ExecutionResult = {
    ok: true,
    transactionId,
    idempotencyKey,
    status: 'settled',
    strategy,
    plan,
    legs,
    settledAt: settlement.settledAt,
    ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
  };

  deps.idempotency.complete(idempotencyKey, success, now());
  return success;
}

// ---------------------------------------------------------------------------
// Strategy B — float-fronted settlement
// ---------------------------------------------------------------------------

async function executeFloatFronted(
  params: StrategyParams & { userId: string },
  deps: ExecutorDeps
): Promise<ExecutionResult> {
  const now = deps.now ?? Date.now;
  const { plan, payee, transactionId, idempotencyKey, userId } = params;
  const legs = plan.legs;
  const strategy: SettlementStrategy = 'float_fronted';

  // ---- 2. Can the float carry this? -------------------------------------
  const decision = deps.treasury.canFront({ userId, plan, now: now() });

  if (!decision.allowed) {
    // A single-leg plan has no partial-charge risk: there is only one account
    // to debit, so debit-then-settle is safe even without a hold, and the
    // existing rollback path covers a failed payout. Multi-leg is different —
    // debiting several accounts with neither holds nor float is precisely the
    // failure this engine exists to prevent, so refuse rather than gamble.
    if (legs.length === 1) {
      return executeHoldThenCapture(
        { plan, payee, transactionId, idempotencyKey },
        deps
      );
    }

    deps.idempotency.abandon(idempotencyKey); // nothing moved
    return fail(plan, legs, {
      transactionId,
      idempotencyKey,
      strategy,
      stage: 'float_refused',
      reason: decision.detail,
      fullyRolledBack: true,
      status: 'failed',
    });
  }

  deps.treasury.open({
    transactionId,
    userId,
    amount: plan.amount,
    currency: plan.currency,
    now: now(),
  });

  // ---- 3. Pay the payee, once, from float -------------------------------
  const settlement = await deps.settlementRail.settle({
    payee,
    amount: plan.amount,
    currency: plan.currency,
    idempotencyKey: `${idempotencyKey}:settle`,
    legs,
  });

  if (!settlement.ok) {
    // The user's accounts have not been touched yet, so this is a clean abort.
    deps.treasury.cancel(transactionId);
    deps.idempotency.abandon(idempotencyKey);
    return fail(plan, legs, {
      transactionId,
      idempotencyKey,
      strategy,
      stage: 'settlement',
      reason: settlement.reason,
      fullyRolledBack: true,
      status: 'failed',
    });
  }

  const ledgerEntries: LedgerEntry[] = [
    ...deps.ledger.post(
      transactionId,
      floatToPayeePostings(payee, plan.amount, plan.currency),
      now()
    ),
  ];

  // ---- 4. Collect from the user's accounts ------------------------------
  // Past this point the payment has *succeeded* — the payee has their money.
  // A leg that won't collect is Lenz's exposure to recover, and must never be
  // reported to the user as a failed payment.
  const uncollected: FundingLeg[] = [];

  for (const leg of legs) {
    const collected = await collectLeg(leg, deps, idempotencyKey);

    if (collected) {
      leg.status = 'captured';
      deps.treasury.recover(transactionId, leg.amountInSettlementCurrency);
      ledgerEntries.push(
        ...deps.ledger.post(transactionId, sourceToFloatPostings(leg), now())
      );
    } else {
      leg.status = 'failed';
      deps.treasury.recordFailedCollection(transactionId);
      uncollected.push(leg);
    }
  }

  const success: ExecutionResult = {
    ok: true,
    transactionId,
    idempotencyKey,
    status: 'settled',
    strategy,
    plan,
    legs,
    settledAt: settlement.settledAt,
    ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
    uncollectedLegs: uncollected.length > 0 ? uncollected : undefined,
  };

  deps.idempotency.complete(idempotencyKey, success, now());
  return success;
}

/**
 * Pull one leg's funds into float. Expressed as hold-then-capture so the same
 * rail contract serves both strategies; on a rail without native holds the
 * hold is a formality and the capture does the real debit.
 */
async function collectLeg(
  leg: FundingLeg,
  deps: ExecutorDeps,
  idempotencyKey: string
): Promise<boolean> {
  const rail = deps.rails.resolve(leg.source);

  const held = await rail.hold({
    legId: leg.id,
    source: leg.source,
    amountInSourceCurrency: leg.amountInSourceCurrency,
    currency: leg.sourceCurrency,
    idempotencyKey: `${idempotencyKey}:collect-hold:${leg.id}`,
    ttlMs: DEFAULT_HOLD_TTL_MS,
  });

  if (!held.ok) {
    leg.failureReason = held.reason;
    return false;
  }

  const captured = await rail.capture({
    legId: leg.id,
    source: leg.source,
    holdRef: held.holdRef,
    amountInSourceCurrency: leg.amountInSourceCurrency,
    idempotencyKey: `${idempotencyKey}:collect-capture:${leg.id}`,
  });

  if (!captured.ok) {
    leg.failureReason = captured.reason;
    await rail.release({
      legId: leg.id,
      source: leg.source,
      holdRef: held.holdRef,
      idempotencyKey: `${idempotencyKey}:collect-release:${leg.id}`,
    });
    return false;
  }

  leg.holdRef = held.holdRef;
  leg.captureRef = captured.captureRef;
  return true;
}

// ---------------------------------------------------------------------------
// Rate-lock revalidation (§5.5)
// ---------------------------------------------------------------------------

type RefreshOutcome =
  | { ok: true; plan: FundingPlan }
  | { ok: false; reason: string };

/**
 * Re-price any leg whose rate lock lapsed between confirm and execution.
 *
 * The payee's amount is fixed — they are owed what the user agreed to pay — so
 * a fresh rate changes how much *source* currency comes out, not how much
 * lands. If that new debit exceeds the account's balance, or the price moved
 * more than the tolerance, the user has to re-confirm.
 */
function refreshExpiredQuotes(
  plan: FundingPlan,
  feed: RateFeed,
  now: number
): RefreshOutcome {
  if (!plan.legs.some((leg) => isQuoteExpired(leg.quote, now))) {
    return { ok: true, plan };
  }

  const legs: FundingLeg[] = [];

  for (const leg of plan.legs) {
    if (!isQuoteExpired(leg.quote, now)) {
      legs.push(leg);
      continue;
    }

    const outcome = requote(leg.quote, feed, { now });
    if (outcome.status === 'reconfirm_required') {
      const direction = outcome.drift > 0 ? 'moved against you' : 'moved in your favour';
      return {
        ok: false,
        reason: `The ${leg.sourceCurrency}→${leg.settlementCurrency} rate ${direction} by ${(
          Math.abs(outcome.drift) * 100
        ).toFixed(2)}%. Please confirm again.`,
      };
    }

    const amountInSourceCurrency = fromSettlement(
      outcome.quote,
      leg.amountInSettlementCurrency
    );
    if (amountInSourceCurrency > leg.source.rawBalance) {
      return {
        ok: false,
        reason: `${leg.source.label} no longer covers its share at the current rate.`,
      };
    }

    legs.push({
      ...leg,
      quote: outcome.quote,
      amountInSourceCurrency,
      feeInSettlementCurrency: legFee(
        outcome.quote,
        amountInSourceCurrency,
        leg.amountInSettlementCurrency
      ),
    });
  }

  const expiries = legs.map((leg) => leg.quote.expiresAt).filter(Number.isFinite);

  return {
    ok: true,
    plan: {
      ...plan,
      legs,
      totalFees: sumAmounts(
        legs.map((leg) => leg.feeInSettlementCurrency),
        plan.currency
      ),
      expiresAt: expiries.length > 0 ? Math.min(...expiries) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Ordering and rollback (§5.7)
// ---------------------------------------------------------------------------

/**
 * Rails that can't truly hold (they debit outright) go last, so a plan that is
 * going to fail at hold time most likely fails before touching them.
 */
function orderForHolding(legs: FundingLeg[]): FundingLeg[] {
  return [...legs].sort((a, b) => {
    const aWeak = a.source.type === 'wallet' ? 1 : 0;
    const bWeak = b.source.type === 'wallet' ? 1 : 0;
    return aWeak - bWeak;
  });
}

/** Release outstanding holds. Returns true only if every release succeeded. */
async function releaseAll(
  legs: FundingLeg[],
  deps: ExecutorDeps,
  idempotencyKey: string
): Promise<boolean> {
  let allReleased = true;

  for (const leg of legs) {
    if (leg.status !== 'held' || !leg.holdRef) continue;
    const rail = deps.rails.resolve(leg.source);
    const result = await rail.release({
      legId: leg.id,
      source: leg.source,
      holdRef: leg.holdRef,
      idempotencyKey: `${idempotencyKey}:release:${leg.id}`,
    });

    if (result.ok) {
      leg.status = 'released';
    } else {
      allReleased = false;
      leg.failureReason = result.reason;
    }
  }

  return allReleased;
}

/**
 * Unwind a partially executed plan: refund what was captured, release what was
 * merely held, and mirror both in the ledger.
 *
 * Returns true only when the user is genuinely made whole. A false result
 * means real money is sitting somewhere it shouldn't and a human has to
 * intervene — the caller surfaces that as `partially_reversed`, never as a
 * plain failure.
 */
async function rollback(
  capturedLegs: FundingLeg[],
  heldLegs: FundingLeg[],
  deps: ExecutorDeps,
  transactionId: string,
  idempotencyKey: string,
  reason: string
): Promise<boolean> {
  const released = await releaseAll(heldLegs, deps, idempotencyKey);
  let allRefunded = true;

  for (const leg of capturedLegs) {
    if (leg.status !== 'captured' || !leg.captureRef) continue;
    const rail = deps.rails.resolve(leg.source);

    if (!rail.refund) {
      allRefunded = false;
      leg.failureReason = `${leg.source.label} cannot be refunded automatically`;
      continue;
    }

    const result = await rail.refund({
      legId: leg.id,
      source: leg.source,
      captureRef: leg.captureRef,
      amountInSourceCurrency: leg.amountInSourceCurrency,
      idempotencyKey: `${idempotencyKey}:refund:${leg.id}`,
      reason,
    });

    if (!result.ok) {
      allRefunded = false;
      leg.failureReason = result.reason;
      continue;
    }

    leg.status = 'reversed';
    const original = deps.ledger.forLeg(leg.id).filter((entry) => !entry.reversalOf);
    if (original.length > 0) {
      deps.ledger.post(transactionId, reversalPostings(original, reason));
    }
  }

  return released && allRefunded;
}

function fail(
  plan: FundingPlan,
  legs: FundingLeg[],
  detail: {
    transactionId: string;
    idempotencyKey: string;
    strategy: SettlementStrategy;
    stage: ExecutionFailureStage;
    reason: string;
    fullyRolledBack: boolean;
    status: 'failed' | 'partially_reversed';
  }
): ExecutionFailure {
  return {
    ok: false,
    transactionId: detail.transactionId,
    idempotencyKey: detail.idempotencyKey,
    status: detail.status,
    strategy: detail.strategy,
    stage: detail.stage,
    reason: detail.reason,
    plan,
    legs,
    fullyRolledBack: detail.fullyRolledBack,
  };
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

/**
 * Per-account breakdown for the receipt (§5.4), e.g.
 * "₦3,000 from GTBank + ₦1,500 (converted from $1.00) from USD account".
 */
export function describeLegs(legs: FundingLeg[]): string[] {
  return legs.map((leg) => {
    const settled = roundCurrency(leg.amountInSettlementCurrency, leg.settlementCurrency);
    const base = `${settled.toLocaleString()} ${leg.settlementCurrency} from ${leg.source.label}`;
    if (leg.sourceCurrency === leg.settlementCurrency) return base;
    return `${base} (converted from ${leg.amountInSourceCurrency} ${leg.sourceCurrency})`;
  });
}

export const MAX_WATERFALL_LEGS = Orchestration.maxWaterfallLegs;
