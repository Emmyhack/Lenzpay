import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { useBiometrics } from '@/hooks/useBiometrics';
import { useSecurityStore } from '@/store/security';
import { showToast } from '@/components/ui/Toast';

export default function BiometricsScreen() {
  const router = useRouter();
  const { isSupported, isEnrolled, type, authenticate } = useBiometrics();
  const setBiometricPref = useSecurityStore((s) => s.setBiometricPref);
  const toggleFaceId = useSecurityStore((s) => s.toggleFaceId);

  const available = isSupported && isEnrolled;
  const label = type === 'faceId' ? 'Face ID' : type === 'fingerprint' ? 'Fingerprint' : 'Biometrics';
  const glyph = type === 'faceId' ? '🙂' : '👆';

  // Nothing to enable on this device — don't block onboarding on it.
  useEffect(() => {
    if (isSupported === false) {
      const timer = setTimeout(() => router.replace('/(auth)/kyc'), 400);
      return () => clearTimeout(timer);
    }
  }, [isSupported, router]);

  const handleEnable = async () => {
    const success = await authenticate('Enable biometric sign-in');
    if (success) {
      setBiometricPref(type);
      toggleFaceId(true);
      router.replace('/(auth)/kyc');
    } else {
      showToast('error', "Couldn't verify", 'Try again, or skip for now.');
    }
  };

  const handleSkip = () => {
    setBiometricPref('none');
    router.replace('/(auth)/kyc');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        <View style={styles.ring}>
          <Text style={styles.glyph}>{glyph}</Text>
        </View>

        <Text style={styles.title}>Enable {label}</Text>
        <Text style={styles.subtitle}>Sign in and confirm payments faster with {label.toLowerCase()}.</Text>

        <Button label={`Enable ${label}`} onPress={handleEnable} disabled={!available} style={styles.enableButton} />
        <Text style={styles.skip} onPress={handleSkip}>
          Skip for now
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  ring: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  glyph: { fontSize: 40 },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineMd.fontSize,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  enableButton: {
    width: '100%',
  },
  skip: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.lg,
    padding: Spacing.sm,
  },
});
