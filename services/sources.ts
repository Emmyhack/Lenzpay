import { api } from './api';
import { delay } from '@/mock/delay';
import { Config } from '@/constants/config';
import type { PaymentSource } from '@/types/payment';

export async function fetchSources(): Promise<PaymentSource[]> {
  if (Config.useMockData) {
    await delay();
    const { MOCK_SOURCES } = await import('@/mock/data');
    return MOCK_SOURCES;
  }
  const { data } = await api.get<PaymentSource[]>('/sources');
  return data;
}

export async function addBankSource(accountNumber: string, bankCode: string): Promise<PaymentSource> {
  if (Config.useMockData) {
    await delay(600, 1200);
    return {
      id: `src_${Date.now()}`,
      type: 'bank',
      label: 'New Bank',
      accountMask: `*${accountNumber.slice(-4)}`,
      currency: 'NGN',
      balance: 0,
      rawBalance: 0,
      rawCurrency: 'NGN',
      isDefault: false,
      flag: '🇳🇬',
      lastSynced: new Date(),
    };
  }
  const { data } = await api.post<PaymentSource>('/sources/bank', { accountNumber, bankCode });
  return data;
}

export async function removeSource(id: string): Promise<void> {
  if (Config.useMockData) {
    await delay(300, 600);
    return;
  }
  await api.delete(`/sources/${id}`);
}

export async function refreshSourceBalance(id: string): Promise<PaymentSource | undefined> {
  const sources = await fetchSources();
  return sources.find((s) => s.id === id);
}
