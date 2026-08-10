import type { CurrencyCode, PaymentSource } from './payment';

/**
 * Data model for the Funding Orchestration Engine (§5) and the ledger (§6.2).
 *
 * Vocabulary used throughout:
 *  - *settlement currency* — what the payee is actually paid in.
 *  - *source currency*     — what a funding source natively holds (NGN, USD, BTC…).
 *  - *leg*                 — one source's contribution to one payment.
 */

// ---------------------------------------------------------------------------
// FX / liquidity quotes (§5.5, §5.6)
// ---------------------------------------------------------------------------

export type QuoteProvider = 'fx_partner' | 'crypto_liquidity' | 'none';

export interface FxQuote {
  id: string;
  from: CurrencyCode;
  to: CurrencyCode;
  /** Units of `to` per 1 unit of `from`, before fees. */
  rate: number;
  /** Proportional spread taken on the converted amount, e.g. 0.012 = 1.2%. */
  feeRate: number;
  /** Flat fee charged in the *target* currency. */
  flatFee: number;
  provider: QuoteProvider;
  quotedAt: number;
  /** Rate-lock expiry. Past this, the engine must re-quote (§5.5). */
  expiresAt: number;
}

/** Identity quote for same-currency legs — no conversion, no fee. */
export function identityQuote(currency: CurrencyCode, now = Date.now()): FxQuote {
  return {
    id: `q_identity_${currency}`,
    from: currency,
    to: currency,
    rate: 1,
    feeRate: 0,
    flatFee: 0,
    provider: 'none',
    quotedAt: now,
    expiresAt: Number.POSITIVE_INFINITY,
  };
}

// ---------------------------------------------------------------------------
// Funding legs and plans (§5.3, §5.4)
// ---------------------------------------------------------------------------

export type LegStatus =
  | 'planned'
  | 'held'
  | 'captured'
  | 'released'
  | 'failed'
  | 'reversed';

export interface FundingLeg {
  id: string;
  sourceId: string;
  source: PaymentSource;

  /** Debited from the source, in the source's own currency/asset. */
  amountInSourceCurrency: number;
  sourceCurrency: CurrencyCode;

  /** Lands at the payee, net of conversion fees, in settlement currency. */
  amountInSettlementCurrency: number;
  settlementCurrency: CurrencyCode;

  /** Conversion cost attributed to this leg, in settlement currency. */
  feeInSettlementCurrency: number;

  /** The quote this leg's arithmetic was built on. Identity for same-currency. */
  quote: FxQuote;

  status: LegStatus;
  holdRef?: string;
  captureRef?: string;
  failureReason?: string;
}

export type PlanKind = 'single_source' | 'waterfall';

export interface FundingPlan {
  id: string;
  kind: PlanKind;
  legs: FundingLeg[];
  /** The full amount owed to the payee (A), in settlement currency. */
  amount: number;
  currency: CurrencyCode;
  /** Sum of every leg's conversion cost, in settlement currency. */
  totalFees: number;
  /**
   * Earliest quote expiry across all legs — the plan as a whole is only good
   * until this instant. `null` when every leg is same-currency (§5.5).
   */
  expiresAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Ranking (§5.2)
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  userPriority: number;
  currencyProximity: number;
  conversionCost: number;
  reliability: number;
  reservePenalty: number;
  total: number;
}

export interface RankedSource {
  source: PaymentSource;
  /**
   * What this source could actually deliver to the payee in settlement
   * currency, *net* of conversion fees. This is the number the waterfall
   * arithmetic uses — never the raw balance.
   */
  normalizedBalance: number;
  eligible: boolean;
  coversFull: boolean;
  quote: FxQuote;
  score: number;
  /** Retained so every ranking decision is auditable/disputable (§6.1). */
  breakdown: ScoreBreakdown;
}

// ---------------------------------------------------------------------------
// Planning results
// ---------------------------------------------------------------------------

export type PlanFailureReason =
  | 'invalid_amount'
  | 'no_eligible_sources'
  | 'insufficient_funds'
  /**
   * The user's total balance *does* cover the payment, but not within the
   * maximum number of legs a single waterfall is allowed. Distinct from
   * `insufficient_funds` because the remedy is different: move money together,
   * rather than add money.
   */
  | 'exceeds_leg_limit';

export interface PlanFailure {
  ok: false;
  reason: PlanFailureReason;
  /** How far short the user's *total* normalized balance falls. */
  shortfall: number;
  totalAvailable: number;
  amount: number;
  currency: CurrencyCode;
  ranked: RankedSource[];
}

export interface PlanSuccess {
  ok: true;
  plan: FundingPlan;
  ranked: RankedSource[];
  totalAvailable: number;
}

export type PlanResult = PlanSuccess | PlanFailure;

// ---------------------------------------------------------------------------
// Execution (§5.4, §5.7)
// ---------------------------------------------------------------------------

export type TransactionStatus =
  | 'pending'
  | 'held'
  | 'executing'
  | 'settled'
  | 'failed'
  | 'partially_reversed';

export type ExecutionFailureStage =
  | 'rate_expired'
  | 'hold'
  | 'convert'
  | 'capture'
  | 'settlement'
  /** The float declined to front the payment and no safe fallback existed. */
  | 'float_refused';

/**
 * How a plan gets settled atomically.
 *
 * - `hold_then_capture` — §5.4 as written. Requires rails that can authorise
 *   without moving money (cards, some FX and custody partners).
 * - `float_fronted` — Lenz's float pays the payee in one indivisible operation,
 *   then collects from the user's accounts. The only workable option on rails
 *   with no authorisation step, which includes every Nigerian bank rail.
 */
export type SettlementStrategy = 'hold_then_capture' | 'float_fronted';

export interface ExecutionSuccess {
  ok: true;
  transactionId: string;
  idempotencyKey: string;
  status: 'settled';
  strategy: SettlementStrategy;
  plan: FundingPlan;
  /** Per-account breakdown for the receipt (§5.4). */
  legs: FundingLeg[];
  settledAt: number;
  ledgerEntryIds: string[];
  /**
   * Float-fronted only: legs the engine could not collect yet. The payee has
   * been paid regardless — these are Lenz's to recover, not the user's problem,
   * but they must never be silently dropped.
   */
  uncollectedLegs?: FundingLeg[];
}

export interface ExecutionFailure {
  ok: false;
  transactionId: string;
  idempotencyKey: string;
  status: 'failed' | 'partially_reversed';
  strategy: SettlementStrategy;
  stage: ExecutionFailureStage;
  reason: string;
  plan: FundingPlan;
  legs: FundingLeg[];
  /** True when every hold placed was successfully released (§5.7). */
  fullyRolledBack: boolean;
}

export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

// ---------------------------------------------------------------------------
// Payee (§3.3)
// ---------------------------------------------------------------------------

export type PayeeResolutionType =
  | 'qr'
  | 'account_number'
  | 'lenz_tag'
  | 'crypto_address';

export type ReceivingMethod =
  | 'bank_transfer'
  | 'card_acquiring'
  | 'crypto_settlement';

export interface Payee {
  id: string;
  displayName: string;
  resolutionType: PayeeResolutionType;
  settlementCurrency: CurrencyCode;
  receivingMethod: ReceivingMethod;
  /** Assets this payee will take directly, skipping the off-ramp (§5.6). */
  acceptedCryptoAssets?: CurrencyCode[];
  accountNumber?: string;
  bankCode?: string;
  cryptoAddress?: string;
  lenzTag?: string;
  isVerified: boolean;
}

// ---------------------------------------------------------------------------
// Ledger (§6.1)
// ---------------------------------------------------------------------------

export type LedgerAccount =
  | 'funding_source'
  | 'lenz_float'
  | 'payee_settlement'
  | 'fx_spread_revenue'
  /** Absorbs the cross-currency position on a conversion leg. */
  | 'fx_clearing';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerEntry {
  id: string;
  transactionId: string;
  legId?: string;
  account: LedgerAccount;
  /** Which concrete source/payee/float this posting hits. */
  accountRef: string;
  direction: LedgerDirection;
  amount: number;
  currency: CurrencyCode;
  description: string;
  createdAt: number;
  /** Set when this entry reverses an earlier one (partial reversal, §7). */
  reversalOf?: string;
}
