import type { PaymentSource, Transaction, Merchant } from '@/types/payment';
import type { User } from '@/types/user';

export const MOCK_USER: User = {
  id: 'usr_001',
  fullName: 'Ada Okafor',
  phone: '+2348012345678',
  email: 'ada.okafor@example.com',
  avatarInitials: 'AO',
  kycStatus: 'verified',
  biometricPref: 'faceId',
  referralCode: 'ADA2026',
  createdAt: new Date('2025-11-02'),
};

export const MOCK_SOURCES: PaymentSource[] = [
  {
    id: 'src_access_001',
    type: 'bank',
    label: 'Access Bank',
    accountMask: '*4421',
    currency: 'NGN',
    balance: 842_000,
    rawBalance: 842_000,
    rawCurrency: 'NGN',
    isDefault: true,
    flag: '🇳🇬',
    lastSynced: new Date(),
  },
  {
    id: 'src_opay_001',
    type: 'wallet',
    label: 'OPay',
    accountMask: '*7890',
    currency: 'NGN',
    balance: 320_000,
    rawBalance: 320_000,
    rawCurrency: 'NGN',
    isDefault: false,
    flag: '🇳🇬',
    lastSynced: new Date(),
  },
  {
    id: 'src_grey_001',
    type: 'usd',
    label: 'Grey Finance',
    accountMask: 'Virtual',
    currency: 'NGN', // stored as NGN-equiv
    balance: 612.4 * 1550, // 949,220
    rawBalance: 612.4,
    rawCurrency: 'USD',
    isDefault: false,
    flag: '🇺🇸',
    lastSynced: new Date(),
  },
  {
    id: 'src_btc_001',
    type: 'crypto',
    label: 'Bitcoin',
    accountMask: 'bc1q...a3kf',
    currency: 'NGN',
    balance: 0.019 * 96_655_000, // ~1,836,445
    rawBalance: 0.019,
    rawCurrency: 'BTC',
    isDefault: false,
    flag: '₿',
    lastSynced: new Date(),
  },
  {
    id: 'src_usdt_001',
    type: 'crypto',
    label: 'USDT',
    accountMask: 'TRC20',
    currency: 'NGN',
    balance: 320 * 1548, // 495,360
    rawBalance: 320,
    rawCurrency: 'USDT',
    isDefault: false,
    flag: '💵',
    lastSynced: new Date(),
  },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn_001',
    merchantName: 'Bolt Ride',
    merchantIcon: '🚗',
    category: 'transport',
    amount: 2_800,
    direction: 'debit',
    sourceLabel: 'Access Bank *4421',
    mode: 'auto',
    pointsEarned: 14,
    cashbackNGN: 7,
    timestamp: new Date(),
    status: 'completed',
    txnRef: 'LNZ-20250407-001',
  },
  {
    id: 'txn_002',
    merchantName: 'Shoprite Lekki',
    merchantIcon: '🛒',
    category: 'shopping',
    amount: 18_400,
    direction: 'debit',
    sourceLabel: 'Smart Split (2 sources)',
    mode: 'split',
    pointsEarned: 92,
    cashbackNGN: 46,
    timestamp: new Date(Date.now() - 86_400_000),
    status: 'completed',
    txnRef: 'LNZ-20250406-002',
  },
  {
    id: 'txn_003',
    merchantName: 'Coffee & Co.',
    merchantIcon: '☕',
    category: 'food',
    amount: 4_500,
    direction: 'debit',
    sourceLabel: 'Grey Finance (USD→NGN)',
    mode: 'auto',
    fxRate: '$1 = ₦1,550',
    pointsEarned: 22,
    cashbackNGN: 11,
    timestamp: new Date(Date.now() - 86_400_000),
    status: 'completed',
    txnRef: 'LNZ-20250406-003',
  },
];

export const MOCK_MERCHANT: Merchant = {
  id: 'mkt_bolt_001',
  name: 'Bolt Driver — Emeka',
  category: 'transport',
  isVerified: true,
  location: 'Lagos, NG',
  acceptedCurrencies: ['NGN', 'USD', 'BTC', 'USDT'],
  icon: '🚗',
};

export const CASHBACK_RATES: Record<string, number> = {
  transport: 0.015,
  food: 0.02,
  shopping: 0.01,
  crypto: 0.03,
  other: 0.005,
};
