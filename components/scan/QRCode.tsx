import React from 'react';
import { View, StyleSheet } from 'react-native';
import QRCodeSVG from 'react-native-qrcode-svg';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface QRCodeProps {
  value: string;
  size?: number;
}

/**
 * Merchant-facing QR generator (onboarding/qr-setup, merchant/qr fullscreen).
 * White cells on a white card regardless of the app's dark theme — QR
 * scanners need real contrast, not our design system's dark palette.
 */
export function QRCode({ value, size = 220 }: QRCodeProps) {
  return (
    <View style={styles.card}>
      <QRCodeSVG value={value} size={size} color={Colors.background} backgroundColor="#ffffff" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignSelf: 'center',
  },
});
