import type { PaymentSource, Transaction, Merchant } from '@/types/payment';
import type { FundingLeg } from '@/types/orchestration';
import type { User } from '@/types/user';
import type { IconName } from '@/components/ui/Icon';

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
    bankCode: '044',
    flag: '🇳🇬',
    lastSynced: new Date(),
    priorityWeight: 90,
    reliability: 0.99,
    providerRef: 'mono:acc_access_4421',
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
    bankCode: '999992',
    flag: '🇳🇬',
    lastSynced: new Date(),
    priorityWeight: 70,
    reliability: 0.96,
    providerRef: 'opay:wallet_7890',
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
    priorityWeight: 50,
    reliability: 0.97,
    providerRef: 'grey:acc_usd_001',
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
    lastSynced: new Date(),
    // Held as savings — the engine only reaches for it when nothing else can
    // cover the payment (§5.2 "keep buffer").
    isReserve: true,
    priorityWeight: 20,
    reliability: 0.94,
    providerRef: 'custody:btc_a3kf',
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
    lastSynced: new Date(),
    priorityWeight: 40,
    reliability: 0.98,
    providerRef: 'custody:usdt_trc20',
  },
];

/**
 * Builds a funding leg for the mock history. Mirrors what the orchestration
 * engine produces, so the detail screen renders the same shape in mock mode as
 * it will against real executions.
 */
function mockLeg(
  sourceId: string,
  amountInSettlement: number,
  options: { amountInSource?: number; rate?: number; fee?: number } = {}
): FundingLeg {
  const source = MOCK_SOURCES.find((s) => s.id === sourceId)!;
  const converting = source.rawCurrency !== 'NGN';
  const rate = options.rate ?? 1;

  return {
    id: `leg_${sourceId}_${amountInSettlement}`,
    sourceId,
    source,
    amountInSourceCurrency: options.amountInSource ?? amountInSettlement,
    sourceCurrency: source.rawCurrency,
    amountInSettlementCurrency: amountInSettlement,
    settlementCurrency: 'NGN',
    feeInSettlementCurrency: options.fee ?? 0,
    quote: {
      id: `q_${sourceId}`,
      from: source.rawCurrency,
      to: 'NGN',
      rate,
      feeRate: converting ? 0.009 : 0,
      flatFee: converting ? 50 : 0,
      provider: converting ? 'fx_partner' : 'none',
      quotedAt: Date.now(),
      expiresAt: converting ? Date.now() + 45_000 : Number.POSITIVE_INFINITY,
    },
    status: 'captured',
  };
}

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn_001',
    merchantName: 'Bolt Ride',
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
    legs: [mockLeg('src_access_001', 2_800)],
    totalFees: 0,
  },
  {
    id: 'txn_002',
    merchantName: 'Shoprite Lekki',
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
    // Neither NGN account covered ₦18,400 alone, so the engine scraped across
    // a bank and the USD account.
    legs: [
      mockLeg('src_access_001', 3_000),
      mockLeg('src_grey_001', 15_400, { amountInSource: 10.06, rate: 1_550, fee: 193 }),
    ],
    totalFees: 193,
  },
  {
    id: 'txn_003',
    merchantName: 'Coffee & Co.',
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
    legs: [mockLeg('src_grey_001', 4_500, { amountInSource: 2.94, rate: 1_550, fee: 57 })],
    totalFees: 57,
  },
];

export const MOCK_MERCHANT: Merchant = {
  id: 'mkt_bolt_001',
  name: 'Bolt Driver — Emeka',
  category: 'transport',
  isVerified: true,
  location: 'Lagos, NG',
  acceptedCurrencies: ['NGN', 'USD', 'BTC', 'USDT'],
};

/**
 * Cashback by category, derived from the profit model rather than chosen.
 *
 * The previous rates (0.5%–3%) exceeded gross revenue: a payment earns ~1.5%
 * MDR, of which Lenz keeps a share, and rails consume most of that. Paying 3%
 * back meant every crypto-category payment lost money on rewards alone, before
 * a rail was touched.
 *
 * `sustainableCashbackRate` puts the affordable ceiling at ~0.18% of the
 * payment on a netted ₦4,500 bank transaction, giving back roughly 30% of net
 * contribution. Categories vary within that: converted payments (crypto, FX)
 * carry spread margin on top of MDR, so they can fund more.
 *
 * `pricing.test.ts` asserts contribution stays positive at these rates across
 * representative payments — change them and that test is the guard.
 */
export const CASHBACK_RATES: Record<string, number> = {
  transport: 0.0015,
  food: 0.002,
  shopping: 0.0012,
  crypto: 0.0025,
  other: 0.001,
};

/**
 * Cash value of one reward point, used to accrue the liability. Points are
 * issued at 0.5% of the payment amount, so this sets their true cost at
 * ~0.025% — small enough to sit alongside cashback inside the margin.
 */
export const REWARD_POINT_VALUE = 0.05;

export const CATEGORY_ICON: Record<string, IconName> = {
  transport: 'car',
  food: 'cafe',
  shopping: 'cart',
  crypto: 'logo-bitcoin',
  other: 'ellipsis-horizontal-circle',
};
