import { useQuery } from '@tanstack/react-query';
import { updateRateFeed } from '@/services/orchestration';

export interface FXRates {
  USD_NGN: number;
  GBP_NGN: number;
  EUR_NGN: number;
  BTC_NGN: number;
  ETH_NGN: number;
  USDT_NGN: number;
  updatedAt: Date;
}

// Mock rates — replace with a real rates endpoint via services/api.ts
const MOCK_RATES: FXRates = {
  USD_NGN: 1550,
  GBP_NGN: 1980,
  EUR_NGN: 1670,
  BTC_NGN: 96_655_000,
  ETH_NGN: 5_240_000,
  USDT_NGN: 1548,
  updatedAt: new Date(),
};

export function useFXRates() {
  return useQuery<FXRates>({
    queryKey: ['fx-rates'],
    queryFn: async () => {
      // Replace with: const { data } = await api.get('/rates');
      await new Promise((r) => setTimeout(r, 300)); // simulate network
      const rates = { ...MOCK_RATES, updatedAt: new Date() };

      // Keep the orchestration engine on the same prices the UI is showing.
      // The engine reads rates outside React, so it needs them pushed in.
      updateRateFeed(
        {
          USD: rates.USD_NGN,
          GBP: rates.GBP_NGN,
          EUR: rates.EUR_NGN,
          BTC: rates.BTC_NGN,
          ETH: rates.ETH_NGN,
          USDT: rates.USDT_NGN,
        },
        rates.updatedAt.getTime()
      );

      return rates;
    },
    refetchInterval: 30_000, // poll every 30 seconds
    staleTime: 25_000,
  });
}

export function convertToNGN(amount: number, currency: string, rates: FXRates): number {
  switch (currency) {
    case 'USD':
      return amount * rates.USD_NGN;
    case 'GBP':
      return amount * rates.GBP_NGN;
    case 'EUR':
      return amount * rates.EUR_NGN;
    case 'BTC':
      return amount * rates.BTC_NGN;
    case 'ETH':
      return amount * rates.ETH_NGN;
    case 'USDT':
      return amount * rates.USDT_NGN;
    default:
      return amount;
  }
}
