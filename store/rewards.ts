import { create } from 'zustand';
import type { RewardsTierName } from '@/types/rewards';

interface RewardsState {
  points: number;
  tier: RewardsTierName;
  lifetimeCashbackNGN: number;
  addPoints: (points: number, cashbackNGN: number) => void;
  redeemPoints: (points: number) => void;
}

const TIER_THRESHOLDS: { tier: RewardsTierName; minPoints: number }[] = [
  { tier: 'Platinum', minPoints: 10_000 },
  { tier: 'Gold', minPoints: 3_000 },
  { tier: 'Silver', minPoints: 1_000 },
  { tier: 'Bronze', minPoints: 0 },
];

function tierForPoints(points: number): RewardsTierName {
  return TIER_THRESHOLDS.find((t) => points >= t.minPoints)?.tier ?? 'Bronze';
}

export const useRewardsStore = create<RewardsState>((set, get) => ({
  points: 3_240,
  tier: 'Gold',
  lifetimeCashbackNGN: 1_620,
  addPoints: (points, cashbackNGN) =>
    set((state) => {
      const newPoints = state.points + points;
      return {
        points: newPoints,
        tier: tierForPoints(newPoints),
        lifetimeCashbackNGN: state.lifetimeCashbackNGN + cashbackNGN,
      };
    }),
  redeemPoints: (points) =>
    set((state) => {
      const newPoints = Math.max(0, state.points - points);
      return { points: newPoints, tier: tierForPoints(newPoints) };
    }),
}));
