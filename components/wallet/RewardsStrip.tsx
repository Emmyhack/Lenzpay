import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { TIER_ICON } from '@/mock/rewards';
import type { RewardsTierName } from '@/types/rewards';

interface RewardsStripProps {
  tier: RewardsTierName;
  points: number;
  cashbackNGN: number;
  onPress?: () => void;
}

export function RewardsStrip({ tier, points, cashbackNGN, onPress }: RewardsStripProps) {
  const tierIcon = TIER_ICON[tier];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.wrap}>
      <View style={styles.left}>
        <Icon name={tierIcon.name} size={16} color={tierIcon.color} />
        <Text style={styles.text}>
          {tier} · {points.toLocaleString()} pts → ₦{cashbackNGN.toLocaleString()}
        </Text>
      </View>
      <Icon name="chevron-forward" size={16} color={Colors.onSurfaceMuted} />
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
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
});
