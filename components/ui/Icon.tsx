import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Thin wrapper around Ionicons with the design system's defaults baked in —
 * the app's single icon vocabulary in place of emoji glyphs, so every
 * screen's UI chrome (nav, tabs, actions, status) reads as one consistent
 * icon language instead of relying on OS-dependent emoji rendering.
 */
export function Icon({ name, size = 20, color = Colors.onSurface, style }: IconProps) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
