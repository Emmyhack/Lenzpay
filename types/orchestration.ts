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
// Source capabilities — what each rail can actually do (§5.2 pre-planning)
// ---------------------------------------------------------------------------

/**
 * The concrete rail a source's money moves on.
 *
 * This is deliberately finer-grained than `SourceType`: "bank" is a product
 * category, but NIP and direct debit are different *capabilities* — one is a
 * push the user initiates, the other a pull we initiate against a mandate.
 * The planner cares about the second distinction and not the first.
 */
export type RailKind =
  | 'NIP'
  | 'DIRECT_DEBIT'
  | 'WALLET'
  | 'CARD'
  | 'ONCHAIN'
  | 'CUSTODY';

/**
 * How much of a source's balance we can actually see.
 *
 * `sufficiency_only` is the interesting one: an Open Banking balance-inquiry
 * endpoint can answer "can this account provide ₦37,500?" without disclosing
 * the balance. That is cheaper and more private than reading the number, and
 * it is all the planner needs to commit a leg — so it is a first-class state,
 * not a degraded form of `exact`.
 */
export type BalanceVisibility = 'exact' | 'sufficiency_only' | 'none';

export type Reversibility = 'full' | 'limited' | 'none';

/**
 * What backs a leg once `prepare()` has run.
 *
 * This is the property that decides whether the payment is safe, and it is
 * per-leg rather than per-plan: a card leg can be genuinely authorised while a
 * bank leg on the same payment cannot be, and the executor must treat them
 * differently rather than degrading the whole plan to the weakest rail.
 *
 * - `PREAUTHORIZED` — a real hold exists on the rail. Capture is near-certain.
 * - `RESERVED`      — funds moved to, or ring-fenced in, an account we control.
 * - `SIGNED`        — an on-chain authorisation exists (user signature, or a
 *                     standing delegated allowance within its limit).
 * - `FLOAT_BACKED`  — nothing can be reserved. The balance was verified and
 *                     the float carries the collection risk. This is the
 *                     honest description of every Nigerian bank leg (ADR-000).
 */
export type GuaranteeKind = 'PREAUTHORIZED' | 'RESERVED' | 'SIGNED' | 'FLOAT_BACKED';

/**
 * What a funding source can do, independent of how much money is in it.
 *
 * The engine resolves this *before* planning, which is the point: the planner
 * should not ask "who has enough money" and discover the rail's limitations
 * afterwards. It should know that a card cannot report a balance but can hold
 * one, that a bank can report a balance but cannot hold it, and rank
 * accordingly.
 */
export interface SourceCapabilities {
  rail: RailKind;
  balanceVisibility: BalanceVisibility;
  debitSupported: boolean;
  /** A genuine authorisation that reserves funds without moving them. */
  holdSupported: boolean;
  captureSupported: boolean;
  releaseSupported: boolean;
  refundSupported: boolean;
  reversible: Reversibility;
  /** The user must approve each spend out-of-band (external crypto wallet). */
  requiresUserSignature: boolean;
  /** A standing allowance lets us spend without a per-payment signature. */
  delegatedSpend: boolean;
  /** Ceiling on the standing allowance, in the source's native currency. */
  delegatedLimit: number | null;
  /** Funds can be ring-fenced in an account we control (custody, FX partner). */
  reserveSupported: boolean;
  /** Typical time from instruction to irreversible settlement. */
  settlementLatencyMs: number;
  /** Prior probability a debit on this rail fails, 0..1. Rail-level, not history. */
  failureRate: number;
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
   * Cost of the debits needed to fund this plan, one per leg, before netting.
   * Distinct from `totalFees`: that is what the *user* pays to convert, this is
   * what *Lenz* pays to move. It is the number that decides whether a leg was
   * worth adding.
   */
  collectionCost: number;
  /**
   * Earliest quote expiry across all legs — the plan as a whole is only good
   * until this instant. `null` when every leg is same-currency (§5.5).
   */
  expiresAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Prepared / locked plans — the `prepare()` stage
// ---------------------------------------------------------------------------

/**
 * A leg that has been made real: balance re-verified, funds authorised where
 * the rail allows it, FX quote locked.
 *
 * `plan()` stays pure precisely so it can run on every keystroke; the external
 * side effects a payment actually needs — a card preauthorisation, a custody
 * reserve, a fresh balance read — all live here instead. That split is what
 * lets the confirmation screen show a figure that is genuinely committed
 * rather than merely estimated.
 */
export interface PreparedLeg extends FundingLeg {
  guarantee: GuaranteeKind;
  capabilities: SourceCapabilities;
  /** Balance re-read during prepare, in the source's native currency. */
  verifiedBalance: number | null;
  /** When that balance was observed. Drives the collection-confidence score. */
  verifiedAt: number | null;
  /** Set for PREAUTHORIZED legs — the authorisation the executor will capture. */
  authorizationRef?: string;
  /** When an authorisation or reserve lapses and must be re-taken. */
  authorizationExpiresAt?: number;
}

export type PrepareFailureReason =
  | 'rate_expired'
  | 'balance_moved'
  | 'authorization_declined'
  | 'reserve_failed'
  | 'signature_required'
  | 'float_refused'
  | 'capability_missing';

/**
 * The immutable object the user confirms and the executor runs.
 *
 * Preserving "what you see is what gets charged" across a `prepare()` step
 * means this must be the *only* thing `execute()` reads. Anything re-derived
 * between confirmation and execution is drift, and drift is exactly the class
 * of bug the single-object design exists to prevent.
 */
export interface LockedPlan {
  id: string;
  planId: string;
  kind: PlanKind;
  legs: PreparedLeg[];
  amount: number;
  currency: CurrencyCode;
  totalFees: number;
  collectionCost: number;
  /**
   * Weakest guarantee across all legs. The plan is only as atomic as its least
   * protected leg, and naming that explicitly stops it being rediscovered at
   * execution time.
   */
  weakestGuarantee: GuaranteeKind;
  /** True when any leg needs the float to be safe (ADR-000). */
  requiresFloat: boolean;
  /** Earliest expiry across locked quotes and placed authorisations. */
  expiresAt: number | null;
  preparedAt: number;
}

export interface PrepareSuccess {
  ok: true;
  locked: LockedPlan;
}

export interface PrepareFailure {
  ok: false;
  reason: PrepareFailureReason;
  message: string;
  /** Legs whose authorisations were rolled back before returning. */
  releasedLegs: PreparedLeg[];
  /** True when nothing was left authorised anywhere. */
  fullyRolledBack: boolean;
}

export type PrepareResult = PrepareSuccess | PrepareFailure;

// ---------------------------------------------------------------------------
// Ranking (§5.2)
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  userPriority: number;
  currencyProximity: number;
  conversionCost: number;
  reliability: number;
  reservePenalty: number;
  /**
   * How strong a guarantee this source's rail can offer once prepared —
   * a real hold outranks a verified-but-unlockable balance. This is the term
   * that makes the planner capability-aware rather than balance-aware.
   */
  settlementCertainty: number;
  /**
   * How much we trust the balance we are planning against, combining what the
   * rail will disclose with how recently it was observed. A card discloses
   * nothing and scores low here — but scores top on `settlementCertainty`,
   * which is exactly the trade the planner should be able to reason about.
   */
  balanceCertainty: number;
  /** Rail-level failure prior, distinct from this account's own history. */
  railReliability: number;
  /** Settlement speed, normalised. Slow rails are worse, not disqualifying. */
  latency: number;
  /** Subtracted when a leg would put Lenz's float at risk (ADR-004). */
  floatExposurePenalty: number;
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
  /** What this source's rail can do — resolved before planning, not after. */
  capabilities: SourceCapabilities;
  /** The strongest backing this source could offer if prepared right now. */
  guarantee: GuaranteeKind;
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
  | 'crypto_address'
  /** An EMVCo / NQR code issued by someone else's scheme (see services/emvco). */
  | 'emvco';

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
