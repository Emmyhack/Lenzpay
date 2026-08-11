import type { RewardsTier, RewardsTierName } from '@/types/rewards';

/**
 * Every benefit listed below is implemented and asserted by
 * `services/rewards-economics.test.ts`.
 *
 * The previous copy promised priority support, free instant settlement,
 * exclusive offers and a relationship manager — none of which existed. Only
 * the cashback multiplier was real. A loyalty programme that lists benefits it
 * does not deliver is worse than a smaller one that does.
 */
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
    fxSpreadDiscount: 0,
    dailyLimitMultiplier: 1,
    benefits: ['Points on every payment', 'Standard cashback', 'Smart Split across accounts'],
  },
  {
    name: 'Silver',
    minPoints: 1_000,
    nextTierPoints: 3_000,
    cashbackMultiplier: 1.2,
    fxSpreadDiscount: 0.1,
    dailyLimitMultiplier: 1.5,
    benefits: ['1.2× cashback', '10% off FX conversion spread', '1.5× daily limit'],
  },
  {
    name: 'Gold',
    minPoints: 3_000,
    nextTierPoints: 10_000,
    cashbackMultiplier: 1.5,
    fxSpreadDiscount: 0.25,
    dailyLimitMultiplier: 2,
    benefits: ['1.5× cashback', '25% off FX conversion spread', '2× daily limit'],
  },
  {
    name: 'Platinum',
    minPoints: 10_000,
    cashbackMultiplier: 2,
    fxSpreadDiscount: 0.5,
    dailyLimitMultiplier: 3,
    benefits: ['2× cashback', '50% off FX conversion spread', '3× daily limit'],
  },
];
