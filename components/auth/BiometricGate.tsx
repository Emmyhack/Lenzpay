import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useBiometrics } from '@/hooks/useBiometrics';

interface BiometricGateProps {
  onSuccess: () => void;
  onFail?: () => void;
  promptMessage?: string;
}

export function BiometricGate({ onSuccess, onFail, promptMessage }: BiometricGateProps) {
  const { isSupported, isEnrolled, type, authenticate } = useBiometrics();

  const label = type === 'faceId' ? 'Face ID' : type === 'fingerprint' ? 'Fingerprint' : 'Biometrics';
  const glyph: IconName = type === 'faceId' ? 'scan-outline' : 'finger-print';

  const handlePress = async () => {
    const success = await authenticate(promptMessage);
    if (success) onSuccess();
    else onFail?.();
  };

  if (!isSupported || !isEnrolled) return null;

  return (
    <TouchableOpacity onPress={handlePress} style={styles.wrap} accessibilityRole="button" accessibilityLabel={`Authenticate with ${label}`}>
      <View style={styles.ring}>
        <Icon name={glyph} size={32} color={Colors.primary} />
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
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
});
