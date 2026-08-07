import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { RewardsTierName } from '@/types/rewards';

const TIER_ICON: Record<RewardsTierName, string> = {
  Bronze: '🥉',
  Silver: '🥈',
  Gold: '⭐',
  Platinum: '💎',
};

interface RewardsStripProps {
  tier: RewardsTierName;
  points: number;
  cashbackNGN: number;
  onPress?: () => void;
}

export function RewardsStrip({ tier, points, cashbackNGN, onPress }: RewardsStripProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.wrap}>
      <Text style={styles.text}>
        {TIER_ICON[tier]} {tier} · {points.toLocaleString()} pts → ₦{cashbackNGN.toLocaleString()}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
  chevron: {
    color: Colors.onSurfaceMuted,
    fontSize: 16,
  },
});
