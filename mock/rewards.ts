import type { RewardsTier } from '@/types/rewards';

export const REWARDS_TIERS: RewardsTier[] = [
  {
    name: 'Bronze',
    minPoints: 0,
    nextTierPoints: 1_000,
    cashbackMultiplier: 1,
    benefits: ['Earn points on every payment', 'Standard cashback rates', 'Access to Smart Split'],
  },
  {
    name: 'Silver',
    minPoints: 1_000,
    nextTierPoints: 3_000,
    cashbackMultiplier: 1.2,
    benefits: ['1.2x cashback multiplier', 'Priority customer support', 'Higher daily transaction limit'],
  },
  {
    name: 'Gold',
    minPoints: 3_000,
    nextTierPoints: 10_000,
    cashbackMultiplier: 1.5,
    benefits: ['1.5x cashback multiplier', 'Free instant settlements', 'Exclusive merchant offers'],
  },
  {
    name: 'Platinum',
    minPoints: 10_000,
    cashbackMultiplier: 2,
    benefits: ['2x cashback multiplier', 'Dedicated relationship manager', 'Zero FX conversion spread'],
  },
];
