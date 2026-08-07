import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Elevation } from '@/constants/theme';

type CardVariant = 'containerLow' | 'container' | 'containerHigh' | 'bright';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padded?: boolean;
  glow?: boolean;
}

const BG_BY_VARIANT: Record<CardVariant, string> = {
  containerLow: Colors.surfaceContainerLow,
  container: Colors.surfaceContainer,
  containerHigh: Colors.surfaceContainerHigh,
  bright: Colors.surfaceBright,
};

export function Card({ variant = 'container', padded = true, glow = false, style, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: BG_BY_VARIANT[variant] },
        padded && styles.padded,
        glow && Elevation.float,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
  },
  padded: {
    padding: Spacing.lg,
  },
});
