import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { PaymentMode, Transaction } from '@/types/payment';
import type { ExecutionResult, FundingPlan, Payee } from '@/types/orchestration';
import { deriveIdempotencyKey, paymentEngine } from './orchestration';
import { CASHBACK_RATES } from '@/mock/data';
import { REWARDS_TIERS } from '@/mock/rewards';
import type { RewardsTierName } from '@/types/rewards';

const runtimeTransactions = new Map<string, Transaction>();

export interface InitiatePaymentParams {
  payee: Payee;
  /** The plan the user actually confirmed. Never rebuild it here — that would
   *  risk charging different accounts than the ones shown on the confirm
   *  screen. */
  plan: FundingPlan;
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
}

/**
 * Run a confirmed plan through the orchestration engine and shape the outcome
 * into the `Transaction` the history/receipt screens render.
 */
export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResult> {
  const { payee, plan, mode, merchantCategory = 'other', rewardsTier = 'Bronze' } = params;

  const idempotencyKey = deriveIdempotencyKey({
    userId: params.userId,
    payeeId: payee.id,
    amount: plan.amount,
    currency: plan.currency,
    plan,
    attemptNonce: params.attemptNonce,
  });

  const execution = await paymentEngine.execute(plan, payee, idempotencyKey, params.userId);

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
  const cashbackNGN = Math.round(plan.amount * cashbackRate * multiplier);

  const transaction: Transaction = {
    id: execution.transactionId,
    merchantName: payee.displayName,
    category: merchantCategory,
    amount: plan.amount,
    direction: 'debit',
    sourceLabel: describeSources(execution),
    mode,
    fxRate: describeFxRate(execution),
    pointsEarned: Math.round(cashbackNGN * 5),
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
