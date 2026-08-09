import type { RewardsTier, RewardsTierName } from '@/types/rewards';
import type { IconName } from '@/components/ui/Icon';
import { Colors } from '@/constants/theme';

export const TIER_ICON: Record<RewardsTierName, { name: IconName; color: string }> = {
  Bronze: { name: 'medal', color: '#cd7f32' }, // no design-system token for bronze/silver — one-off medal tones
  Silver: { name: 'medal', color: '#c0c0c0' },
  Gold: { name: 'trophy', color: Colors.warning },
  Platinum: { name: 'diamond', color: Colors.secondary },
};

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
