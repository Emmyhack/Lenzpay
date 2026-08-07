import { api } from './api';
import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { MerchantPayment, Settlement } from '@/types/merchant';

export async function fetchMerchantPayments(): Promise<MerchantPayment[]> {
  if (Config.useMockData) {
    await delay();
    return [
      {
        id: 'mp_001',
        payerLabel: '***7890',
        amountNGN: 2_800,
        mode: 'auto',
        status: 'completed',
        timestamp: new Date(),
        txnRef: 'LNZ-20250407-001',
      },
    ];
  }
  const { data } = await api.get<MerchantPayment[]>('/merchant/payments');
  return data;
}

export async function fetchSettlements(): Promise<Settlement[]> {
  if (Config.useMockData) {
    await delay();
    return [
      {
        id: 'stl_001',
        amountNGN: 184_200,
        status: 'settled',
        bankLabel: 'GTBank *2210',
        initiatedAt: new Date(Date.now() - 86_400_000),
        settledAt: new Date(),
        reference: 'STL-20250406-001',
        txnCount: 34,
      },
    ];
  }
  const { data } = await api.get<Settlement[]>('/merchant/settlements');
  return data;
}
