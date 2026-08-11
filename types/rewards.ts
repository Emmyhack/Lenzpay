export type RewardsTierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface RewardsTier {
  name: RewardsTierName;
  minPoints: number;
  nextTierPoints?: number;
  benefits: string[];
  /** Applied to cashback at settlement — see services/payments.ts. */
  cashbackMultiplier: number;
  /**
   * Share of the FX spread waived, 0..1. Fed into the quote's fee schedule, so
   * a higher tier genuinely converts more cheaply rather than being told it
   * does. FX is where the margin is (docs/PROFIT-MODEL.md), which is what
   * makes this the tier benefit worth having.
   */
  fxSpreadDiscount: number;
  /** Multiplier on the user's daily spending ceiling. */
  dailyLimitMultiplier: number;
}

export interface CashbackRates {
  transport: number;
  food: number;
  shopping: number;
  crypto: number;
  other: number;
}

export type RedemptionMethod = 'cashback' | 'airtime' | 'bank_transfer';

export interface Redemption {
  id: string;
  method: RedemptionMethod;
  pointsSpent: number;
  valueNGN: number;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface RewardsState {
  points: number;
  tier: RewardsTierName;
  lifetimeCashbackNGN: number;
}
