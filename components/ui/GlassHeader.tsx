import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '@/constants/theme';

interface GlassHeaderProps extends ViewProps {
  intensity?: number;
}

/**
 * Sticky glassmorphism header — BlurView does the actual backdrop blur (RN
 * has no CSS backdrop-filter); Glass.backgroundColor sits behind/inside it
 * as the tint fallback on platforms where blur is unsupported.
 */
export function GlassHeader({ intensity = Glass.blurIntensity, style, children, ...rest }: GlassHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <BlurView intensity={intensity} tint="dark" style={[styles.base, { paddingTop: insets.top }, style]} {...rest}>
      <View style={styles.tint}>{children}</View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  tint: {
    backgroundColor: Glass.backgroundColor,
  },
});
