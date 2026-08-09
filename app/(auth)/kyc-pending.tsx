import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { SpinningRing } from '@/components/shared/SpinningRing';
import { Icon } from '@/components/ui/Icon';
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
      <TouchableOpacity style={styles.link} onPress={handleGoHome} hitSlop={8}>
        <Text style={styles.linkText}>Go to home</Text>
        <Icon name="arrow-forward" size={14} color={Colors.primary} />
      </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xxl,
    padding: Spacing.sm,
  },
  linkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
  },
});
