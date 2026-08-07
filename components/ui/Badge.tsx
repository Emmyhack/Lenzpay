import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

export type BadgeKind =
  | 'NGN'
  | 'USD'
  | 'BTC'
  | 'USDT'
  | 'ETH'
  | 'AUTO'
  | 'SPLIT'
  | 'LOW'
  | 'VERIFIED'
  | 'DEFAULT';

interface BadgeProps {
  kind: BadgeKind;
  label?: string; // override display text
}

const BADGE_COLOR: Record<BadgeKind, string> = {
  NGN: Colors.ngn,
  USD: Colors.usd,
  BTC: Colors.btc,
  USDT: Colors.usdt,
  ETH: Colors.eth,
  AUTO: Colors.primary,
  SPLIT: Colors.warning,
  LOW: Colors.error,
  VERIFIED: Colors.success,
  DEFAULT: Colors.onSurfaceVariant,
};

const BADGE_LABEL: Record<BadgeKind, string> = {
  NGN: 'NGN',
  USD: 'USD',
  BTC: 'BTC',
  USDT: 'USDT',
  ETH: 'ETH',
  AUTO: '⚡ AUTO',
  SPLIT: '🔀 SPLIT',
  LOW: '✗ LOW',
  VERIFIED: '✓ Verified',
  DEFAULT: 'Default',
};

export function Badge({ kind, label }: BadgeProps) {
  const color = BADGE_COLOR[kind];
  return (
    <View style={[styles.base, { backgroundColor: color + '20' }]}>
      <Text style={[styles.text, { color }]}>{label ?? BADGE_LABEL[kind]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
