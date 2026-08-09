import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { SpinningRing } from '@/components/shared/SpinningRing';
import { fetchKYCStatus } from '@/services/kyc';
import { Config } from '@/constants/config';
import { useAuthStore } from '@/store/auth';

export default function KYCPendingScreen() {
  const router = useRouter();
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const { data } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: fetchKYCStatus,
    refetchInterval: Config.kycPollIntervalMs,
  });

  useEffect(() => {
    if (data?.status === 'verified') {
      completeOnboarding();
      router.replace('/(consumer)');
    }
  }, [data, completeOnboarding, router]);

  const handleGoHome = () => {
    completeOnboarding();
    router.replace('/(consumer)');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.ringWrap}>
        <SpinningRing />
      </View>
      <Text style={styles.title}>Verifying your identity…</Text>
      <Text style={styles.subtitle}>Usually takes under 30 seconds</Text>
      <Text style={styles.link} onPress={handleGoHome}>
        Go to home →
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  ringWrap: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  link: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
    marginTop: Spacing.xxl,
    padding: Spacing.sm,
  },
});
