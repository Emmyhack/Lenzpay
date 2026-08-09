import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

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
        <TouchableOpacity onPress={onPressRight} hitSlop={8}>
          <Text style={styles.right}>{rightLabel}</Text>
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
  right: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
  },
});
