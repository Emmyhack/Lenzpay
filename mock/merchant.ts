import type { MerchantProfile } from '@/types/merchant';

export const MOCK_MERCHANT_PROFILE: MerchantProfile = {
  id: 'mch_001',
  businessName: 'Emeka’s Kitchen',
  category: 'Food & Beverage',
  isVerified: true,
  kycStatus: 'verified',
  qrCodeValue: 'lenzpay://pay/mch_001',
  acceptedCurrencies: ['NGN', 'USD', 'BTC', 'USDT'],
  settlementAccountLabel: 'GTBank *2210',
};

export const REVENUE_LAST_7_DAYS = [
  { day: 'Mon', amountNGN: 84_000 },
  { day: 'Tue', amountNGN: 112_500 },
  { day: 'Wed', amountNGN: 96_200 },
  { day: 'Thu', amountNGN: 140_800 },
  { day: 'Fri', amountNGN: 168_300 },
  { day: 'Sat', amountNGN: 201_400 },
  { day: 'Sun', amountNGN: 155_900 },
];

// Payments count by hour-of-day bucket (0-23), used for the peak-hours heatmap.
export const PEAK_HOURS: number[] = [
  0, 0, 0, 0, 0, 1, 2, 4, 6, 9, 12, 15, 18, 16, 11, 9, 10, 14, 19, 22, 17, 8, 3, 1,
];
