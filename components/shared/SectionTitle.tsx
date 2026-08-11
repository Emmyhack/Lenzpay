import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';

interface SectionTitleProps {
  title: string;
  rightLabel?: string;
  onPressRight?: () => void;
  /** Set when the parent container has no horizontal padding of its own —
   * SectionTitle then supplies its own edge inset. Most screens already pad
   * their content container, so this defaults to false to avoid double
   * padding; opt in only for full-bleed layouts (e.g. the home dashboard). */
  padded?: boolean;
}

export function SectionTitle({ title, rightLabel, onPressRight, padded = false }: SectionTitleProps) {
  return (
    <View style={[styles.row, padded && styles.padded]}>
      <Text style={styles.title}>{title}</Text>
      {rightLabel ? (
        <TouchableOpacity
          style={styles.rightRow}
          onPress={onPressRight}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${rightLabel}: ${title}`}
        >
          <Text style={styles.right}>{rightLabel}</Text>
          <Icon name="chevron-forward" size={14} color={Colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  padded: {
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  right: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
  },
});
