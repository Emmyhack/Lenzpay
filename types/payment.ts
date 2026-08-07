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
  flag: string; // Emoji flag or symbol
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
  icon: string; // emoji
}

export interface Transaction {
  id: string;
  merchantName: string;
  merchantIcon: string;
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
