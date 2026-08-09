import type { IconName } from '@/components/ui/Icon';

export type CurrencyCode = 'NGN' | 'USD' | 'BTC' | 'USDT' | 'ETH';
export type SourceType = 'bank' | 'wallet' | 'usd' | 'crypto';
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
}

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
}
