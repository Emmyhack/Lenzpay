import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { PaymentMode, Transaction } from '@/types/payment';
import type {
  ExecutionResult,
  FundingPlan,
  LockedPlan,
  Payee,
} from '@/types/orchestration';
import { deriveIdempotencyKey, paymentEngine, toFundingPlan } from './orchestration';
import { REWARDS_BUDGET_MODEL, cashbackForPayment, estimateUnitEconomics } from './pricing';
import { CASHBACK_RATES } from '@/mock/data';

/** Points issued per naira of cashback earned. */
const POINTS_PER_NGN_CASHBACK = 5;
import { REWARDS_TIERS } from '@/mock/rewards';
import type { RewardsTierName } from '@/types/rewards';

const runtimeTransactions = new Map<string, Transaction>();

export interface InitiatePaymentParams {
  payee: Payee;
  /**
   * The plan the user actually confirmed. Never rebuild it here — that would
   * risk charging different accounts than the ones shown on the confirm
   * screen.
   *
   * Pass a `LockedPlan` where the confirm screen has already prepared one:
   * its legs carry real authorisations, so nothing is re-authorised and the
   * settlement strategy is read off the guarantees rather than inferred. A
   * bare `FundingPlan` is prepared here instead, immediately before execution.
   */
  plan: FundingPlan | LockedPlan;
  mode: PaymentMode;
  userId: string;
  /** Distinguishes a deliberate repeat payment from a retry of the same one. */
  attemptNonce: string;
  merchantCategory?: string;
  rewardsTier?: RewardsTierName;
}

export interface InitiatePaymentResult {
  success: boolean;
  transaction?: Transaction;
  failureReason?: string;
  /** True when a failure left money moved that couldn't be automatically returned. */
  needsManualReview?: boolean;
  execution?: ExecutionResult;
  /** The prepared plan that ran, so a receipt can show per-leg guarantees. */
  locked?: LockedPlan;
}

/**
 * Run a confirmed plan through the orchestration engine and shape the outcome
 * into the `Transaction` the history/receipt screens render.
 */
export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResult> {
  const { payee, plan, mode, merchantCategory = 'other', rewardsTier = 'Bronze' } = params;

  // Derived from the plan the user confirmed, before preparing it — the key
  // must identify the payment, not the authorisation attempt, or a retry would
  // look like a new payment and charge twice.
  const confirmedPlan: FundingPlan = isLockedPlan(plan) ? toFundingPlan(plan) : plan;

  const idempotencyKey = deriveIdempotencyKey({
    userId: params.userId,
    payeeId: payee.id,
    amount: confirmedPlan.amount,
    currency: confirmedPlan.currency,
    plan: confirmedPlan,
    attemptNonce: params.attemptNonce,
  });

  // Authorise before executing. A plan that has not been prepared is an
  // estimate built from cached balances; preparing it turns each leg into
  // something either genuinely held or explicitly float-backed, and a failure
  // here has moved no money at all.
  let locked: LockedPlan;
  if (isLockedPlan(plan)) {
    locked = plan;
  } else {
    const preparation = await paymentEngine.prepare(plan, params.userId, idempotencyKey);
    if (!preparation.ok) {
      return {
        success: false,
        failureReason: preparation.message,
        // A prepare that could not release everything it placed has left holds
        // on the user's accounts. That needs a human, not a retry.
        needsManualReview: !preparation.fullyRolledBack,
      };
    }
    locked = preparation.locked;
  }

  const execution = await paymentEngine.execute(locked, payee, idempotencyKey, params.userId);

  if (!execution.ok) {
    return {
      success: false,
      failureReason: execution.reason,
      needsManualReview: execution.status === 'partially_reversed',
      execution,
    };
  }

  const cashbackRate = CASHBACK_RATES[merchantCategory] ?? CASHBACK_RATES.other;
  const multiplier = REWARDS_TIERS.find((tier) => tier.name === rewardsTier)?.cashbackMultiplier ?? 1;
  // Advertised rate, capped at what this payment can actually fund. A flat
  // percentage is unsafe on a cost structure with a fixed levy at ₦10,000 and
  // a capped MDR — see cashbackForPayment and docs/PROFIT-MODEL.md.
  //
  // Points are issued per naira of cashback, and cashback is capped against a
  // budget that must already account for the points liability — a circular
  // dependency. Broken by budgeting against the *uncapped* points estimate,
  // which is always at least the final figure, so the budget is never
  // optimistic.
  const headlineRate = cashbackRate * multiplier;
  const pointsUpperBound = Math.round(locked.amount * headlineRate * POINTS_PER_NGN_CASHBACK);

  const cashbackNGN = Math.round(
    cashbackForPayment({
      headlineRate,
      economicsBeforeRewards: estimateUnitEconomics({ plan: toFundingPlan(locked), model: REWARDS_BUDGET_MODEL }),
      points: pointsUpperBound,
      model: REWARDS_BUDGET_MODEL,
    })
  );
  const pointsEarned = Math.round(cashbackNGN * POINTS_PER_NGN_CASHBACK);

  const transaction: Transaction = {
    id: execution.transactionId,
    merchantName: payee.displayName,
    category: merchantCategory,
    amount: locked.amount,
    direction: 'debit',
    sourceLabel: describeSources(execution),
    mode,
    fxRate: describeFxRate(execution),
    pointsEarned,
    cashbackNGN,
    timestamp: new Date(execution.settledAt),
    status: 'completed',
    txnRef: execution.transactionId.toUpperCase().replace('TXN_', 'LNZ-'),
    legs: execution.legs,
    totalFees: plan.totalFees,
    pendingCollection: execution.uncollectedLegs,
  };
  runtimeTransactions.set(transaction.id, transaction);

  return {
    success: true,
    execution,
    transaction,
    locked,
  };
}

function describeSources(execution: Extract<ExecutionResult, { ok: true }>): string {
  const { legs } = execution;
  if (legs.length === 1) {
    const [leg] = legs;
    return `${leg.source.label} ${leg.source.accountMask}`;
  }
  return `Smart Split (${legs.length} sources)`;
}

function describeFxRate(
  execution: Extract<ExecutionResult, { ok: true }>
): string | undefined {
  const converting = execution.legs.find(
    (leg) => leg.sourceCurrency !== leg.settlementCurrency
  );
  if (!converting) return undefined;

  const rate = converting.quote.rate.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return `1 ${converting.sourceCurrency} = ₦${rate}`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function fetchTransactions(): Promise<Transaction[]> {
  if (Config.useMockData) {
    await delay();
    const { MOCK_TRANSACTIONS } = await import('@/mock/data');
    return [...runtimeTransactions.values(), ...MOCK_TRANSACTIONS.filter((item) => !runtimeTransactions.has(item.id))];
  }
  // Imported lazily so the orchestration path carries no dependency on the
  // HTTP client or on expo-secure-store — that keeps the engine runnable (and
  // testable) outside a React Native runtime.
  const { api } = await import('./api');
  const { data } = await api.get<Transaction[]>('/transactions');
  return data;
}

export async function fetchTransactionById(id: string): Promise<Transaction | undefined> {
  const all = await fetchTransactions();
  return all.find((t) => t.id === id);
}

/** A prepared plan carries a guarantee per leg; a raw plan does not. */
function isLockedPlan(plan: FundingPlan | LockedPlan): plan is LockedPlan {
  return 'weakestGuarantee' in plan && 'planId' in plan;
}
