import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useAnimatedBalance } from '@/hooks/useAnimatedBalance';

interface BalanceHeroProps {
  totalNGN: number;
  usdEquivalent?: number;
  sourceCount: number;
}

export function BalanceHero({ totalNGN, usdEquivalent, sourceCount }: BalanceHeroProps) {
  const display = useAnimatedBalance(totalNGN);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>TOTAL BALANCE</Text>
      <Text style={styles.amount}>{display}</Text>
      <Text style={styles.sub}>
        {usdEquivalent ? `≈ $${usdEquivalent.toLocaleString(undefined, { maximumFractionDigits: 2 })} · ` : ''}
        {sourceCount} source{sourceCount === 1 ? '' : 's'} connected
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
  },
  amount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayLg.fontSize,
    lineHeight: Typography.displayLg.lineHeight,
    letterSpacing: Typography.displayLg.letterSpacing,
    color: Colors.onSurface,
    marginTop: Spacing.xs,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
});
