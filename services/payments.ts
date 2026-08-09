import { api } from './api';
import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { PaymentMode, PaymentSource, SplitAllocation, Transaction } from '@/types/payment';

export interface InitiatePaymentParams {
  merchantId: string;
  amountNGN: number;
  mode: PaymentMode;
  sourceId?: string;
  splitAllocations?: SplitAllocation[];
}

export interface InitiatePaymentResult {
  success: boolean;
  transaction?: Transaction;
  failureReason?: string;
}

export async function initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
  if (Config.useMockData) {
    await delay(800, 1600);
    // ~90% success rate in mock mode so failure/retry UI stays reachable.
    const success = Math.random() > 0.1;
    if (!success) {
      return { success: false, failureReason: 'Your bank declined this transaction. Try another source.' };
    }
    return {
      success: true,
      transaction: {
        id: `txn_${Date.now()}`,
        merchantName: 'Merchant',
        category: 'other',
        amount: params.amountNGN,
        direction: 'debit',
        sourceLabel: params.mode === 'split' ? 'Smart Split' : 'Source',
        mode: params.mode,
        pointsEarned: Math.round(params.amountNGN * 0.005),
        cashbackNGN: Math.round(params.amountNGN * 0.005),
        timestamp: new Date(),
        status: 'completed',
        txnRef: `LNZ-${Date.now()}`,
      },
    };
  }

  const { data } = await api.post<InitiatePaymentResult>('/payments', params);
  return data;
}

export async function fetchTransactions(): Promise<Transaction[]> {
  if (Config.useMockData) {
    await delay();
    const { MOCK_TRANSACTIONS } = await import('@/mock/data');
    return MOCK_TRANSACTIONS;
  }
  const { data } = await api.get<Transaction[]>('/transactions');
  return data;
}

export async function fetchTransactionById(id: string): Promise<Transaction | undefined> {
  const all = await fetchTransactions();
  return all.find((t) => t.id === id);
}
