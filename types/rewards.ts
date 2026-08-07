export type RewardsTierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface RewardsTier {
  name: RewardsTierName;
  minPoints: number;
  nextTierPoints?: number;
  benefits: string[];
  cashbackMultiplier: number;
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
