import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { OTPInput } from '@/components/auth/OTPInput';

const RESEND_COOLDOWN_S = 45;

function maskPhone(phone?: string) {
  if (!phone || phone.length < 4) return '+234 ••• ••• ••••';
  return `+234 ••• ••• ${phone.slice(-4)}`;
}

export default function OTPScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [error, setError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleComplete = useCallback(
    async (code: string) => {
      setVerifying(true);
      setError(false);
      // Replace with services/auth.ts verifyOtp(phone, code) against a real backend.
      await new Promise((r) => setTimeout(r, 700));
      const isValid = code.length === 6; // mock: any complete code passes
      setVerifying(false);
      if (isValid) {
        router.push('/(auth)/pin-create');
      } else {
        setError(true);
      }
    },
    [router]
  );

  const handleResend = () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_S);
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Verify Phone" subtitle={maskPhone(phone)} />

      <View style={styles.body}>
        <OTPInput onComplete={handleComplete} error={error} />

        {error ? <Text style={styles.errorText}>That code didn't match. Try again.</Text> : null}
        {verifying ? <ActivityIndicator style={styles.spinner} color={Colors.primary} /> : null}

        <TouchableOpacity onPress={handleResend} disabled={cooldown > 0} style={styles.resendWrap} hitSlop={8}>
          <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>
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
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.errorDim,
    marginTop: Spacing.lg,
  },
  spinner: {
    marginTop: Spacing.lg,
  },
  resendWrap: {
    marginTop: Spacing.xxl,
    padding: Spacing.sm,
  },
  resendText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
  },
  resendTextDisabled: {
    color: Colors.onSurfaceMuted,
  },
});
