import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/constants/theme';

/**
 * A hairline outline at the design system's max ghost-border opacity
 * (outline-variant, 15% white) — used for input fields and cards that need
 * definition without a filled background.
 */
export function GhostBorder({ style, ...rest }: ViewProps) {
  return <View style={[styles.base, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.lg,
  },
});
