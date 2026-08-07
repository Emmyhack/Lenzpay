import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useBiometrics } from '@/hooks/useBiometrics';

interface BiometricGateProps {
  onSuccess: () => void;
  onFail?: () => void;
  promptMessage?: string;
}

export function BiometricGate({ onSuccess, onFail, promptMessage }: BiometricGateProps) {
  const { isSupported, isEnrolled, type, authenticate } = useBiometrics();

  const label = type === 'faceId' ? 'Face ID' : type === 'fingerprint' ? 'Fingerprint' : 'Biometrics';
  const glyph = type === 'faceId' ? '🙂' : '👆';

  const handlePress = async () => {
    const success = await authenticate(promptMessage);
    if (success) onSuccess();
    else onFail?.();
  };

  if (!isSupported || !isEnrolled) return null;

  return (
    <TouchableOpacity onPress={handlePress} style={styles.wrap} accessibilityRole="button" accessibilityLabel={`Authenticate with ${label}`}>
      <View style={styles.ring}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <Text style={styles.label}>Use {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 32 },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
});
