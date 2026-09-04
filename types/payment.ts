import type { IconName } from '@/components/ui/Icon';
// Type-only, so the cycle with orchestration.ts is erased at build time.
import type { FundingLeg, SourceCapabilities } from './orchestration';

export type CurrencyCode = 'NGN' | 'USD' | 'GBP' | 'EUR' | 'BTC' | 'USDT' | 'ETH';
/**
 * Product category of a funding source.
 *
 * `card` and `custody` are separate from `bank` and `usd` because they differ
 * in *capability*, not presentation: a card can authorise but cannot disclose a
 * balance, and a custody account can genuinely ring-fence funds. Collapsing
 * either into `bank` would hide the one property the planner most needs.
 */
export type SourceType = 'bank' | 'wallet' | 'usd' | 'crypto' | 'card' | 'custody';

/**
 * Decimal places each currency settles to. The orchestration engine rounds
 * every leg to its source currency's precision so a plan never asks a rail to
 * move a fraction of a kobo (or a satoshi).
 */
export const CURRENCY_PRECISION: Record<CurrencyCode, number> = {
  NGN: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
  BTC: 8,
  ETH: 8,
  USDT: 6,
};

export const CRYPTO_CURRENCIES: readonly CurrencyCode[] = ['BTC', 'ETH', 'USDT'];

export function isCrypto(currency: CurrencyCode): boolean {
  return CRYPTO_CURRENCIES.includes(currency);
}
export type SourceStatus =
  | 'active'
  | 'insufficient'
  | 'auto'
  | 'split'
  | 'selected'
  | 'default'
  | 'error';

export interface PaymentSource {
  id: string;
  type: SourceType;
  label: string; // "Access Bank"
  accountMask: string; // "*4421"
  currency: CurrencyCode; // display currency (NGN-equivalent bookkeeping)
  balance: number; // Always in NGN-equivalent for comparison
  rawBalance: number; // In the native currency
  rawCurrency: CurrencyCode;
  isDefault: boolean;
  // NIBSS bank code (matches mock/banks.ts) — lets bank/wallet sources render
  // their real institution logo via BankLogo instead of a generic glyph.
  bankCode?: string;
  // Real-world currencies show their national flag; crypto assets render
  // their exact coin logo (see CryptoLogo); anything else falls back to a
  // tinted vector icon.
  flag?: string;
  icon?: IconName;
  iconColor?: string;
  lastSynced: Date;

  // ---- Funding Orchestration Engine inputs (§5.2) ----------------------
  /**
   * User-set preference, 0..100. Higher wins. Defaults to
   * DEFAULT_PRIORITY_WEIGHT when a source predates the orchestration engine.
   */
  priorityWeight?: number;
  /**
   * "Keep buffer" rule — reserve funds rank below everything else and are
   * only drawn on when no other combination can cover the payment.
   */
  isReserve?: boolean;
  /**
   * Rolling success rate of this source/provider, 0..1. Feeds the historical
   * reliability term of priority_score.
   */
  reliability?: number;
  /** Opaque handle for the aggregator/custody provider backing this source. */
  providerRef?: string;
  /**
   * What is actually spendable right now, in the native currency — the ledger
   * balance less pending debits, required minimums and known holds.
   *
   * The planner must use this rather than `rawBalance`. They differ routinely
   * (a ₦100,000 balance with a ₦10,000 pending debit and a ₦5,000 minimum is
   * ₦85,000 of real capacity), and planning against the larger number produces
   * legs that pass planning and fail collection. Falls back to `rawBalance`
   * when a provider cannot break the figure down.
   */
  spendableRawBalance?: number;
  /**
   * Provider-reported capability overrides, merged over the rail defaults.
   *
   * Capabilities vary *within* a rail — one aggregator exposes authorise and
   * capture, another only a single-shot debit — so they have to be per-source
   * facts, not per-type assumptions.
   */
  capabilities?: Partial<SourceCapabilities>;
}

/** Applied when a source carries no explicit user preference. */
export const DEFAULT_PRIORITY_WEIGHT = 50;
/** Assumed success rate for a source with no recorded history. */
export const DEFAULT_RELIABILITY = 0.97;

export interface SplitAllocation {
  source: PaymentSource;
  amount: number; // NGN amount this source covers
}

export type PaymentMode = 'auto' | 'manual' | 'split';

export interface PaymentResult {
  mode: PaymentMode;
  autoSelected?: PaymentSource;
  splitAllocations?: SplitAllocation[];
  manualSelected?: PaymentSource;
  totalCoverable: number;
  deficit: number;
  isCoverable: boolean;
}

export type PaymentFlowState =
  | 'idle'
  | 'scanning'
  | 'merchant_found'
  | 'amount_entered'
  | 'source_selected'
  | 'split_confirmed'
  | 'auth_gate'
  | 'processing'
  | 'success'
  | 'failed';

export interface Merchant {
  id: string;
  name: string;
  category: 'transport' | 'food' | 'shopping' | 'crypto' | 'other';
  isVerified: boolean;
  location: string;
  acceptedCurrencies: CurrencyCode[];
}

export interface Transaction {
  id: string;
  merchantName: string;
  category: string;
  amount: number; // NGN
  direction: 'debit' | 'credit';
  sourceLabel: string;
  mode: PaymentMode;
  fxRate?: string;
  pointsEarned: number;
  cashbackNGN: number;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
  txnRef: string;

  /**
   * Per-account breakdown, when the transaction went through the orchestration
   * engine (§6.2). A `sourceLabel` of "Smart Split (2 sources)" is a summary,
   * not a record — this is what makes a split payment auditable and a per-leg
   * dispute possible.
   */
  legs?: FundingLeg[];
  /** Conversion cost across all legs, in settlement currency. */
  totalFees?: number;
  /** Legs the float has not yet recovered. Payee is paid regardless. */
  pendingCollection?: FundingLeg[];
}
