import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

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
  /** Override the default flex-start self-alignment — set when the badge
   * sits in a centered/column layout instead of a left-aligned row. */
  style?: ViewStyle;
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
  AUTO: 'AUTO',
  SPLIT: 'SPLIT',
  LOW: 'LOW',
  VERIFIED: 'Verified',
  DEFAULT: 'Default',
};

const BADGE_ICON: Partial<Record<BadgeKind, IconName>> = {
  AUTO: 'flash',
  SPLIT: 'shuffle',
  LOW: 'close-circle',
  VERIFIED: 'checkmark-circle',
};

export function Badge({ kind, label, style }: BadgeProps) {
  const color = BADGE_COLOR[kind];
  const icon = BADGE_ICON[kind];

  return (
    <View style={[styles.base, { backgroundColor: color + '20' }, style]}>
      {icon ? <Icon name={icon} size={11} color={color} /> : null}
      <Text style={[styles.text, { color }]}>{label ?? BADGE_LABEL[kind]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
