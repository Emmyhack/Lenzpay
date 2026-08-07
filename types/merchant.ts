import type { CurrencyCode } from './payment';

export type SettlementStatus = 'pending' | 'processing' | 'settled' | 'failed';

export interface MerchantProfile {
  id: string;
  businessName: string;
  category: string;
  isVerified: boolean;
  kycStatus: 'unstarted' | 'pending' | 'verified' | 'rejected';
  qrCodeValue: string;
  acceptedCurrencies: CurrencyCode[];
  settlementAccountLabel: string;
}

export interface Settlement {
  id: string;
  amountNGN: number;
  status: SettlementStatus;
  bankLabel: string;
  initiatedAt: Date;
  settledAt?: Date;
  reference: string;
  txnCount: number;
}

export interface QRConfig {
  merchantId: string;
  value: string;
  fixedAmount?: number; // if set, QR is amount-locked
  label: string;
}

export interface MerchantPayment {
  id: string;
  payerLabel: string; // masked customer identifier
  amountNGN: number;
  mode: 'auto' | 'manual' | 'split';
  status: 'completed' | 'pending' | 'failed';
  timestamp: Date;
  txnRef: string;
}
