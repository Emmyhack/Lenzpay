import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { fetchKYCStatus } from '@/services/kyc';
import { Config } from '@/constants/config';
import { useAuthStore } from '@/store/auth';

function SpinningRing() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View style={[styles.ring, style]}>
      <View style={styles.ringGap} />
    </Animated.View>
  );
}

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
      <SpinningRing />
      <Text style={styles.title}>Verifying your identity…</Text>
      <Text style={styles.subtitle}>Usually takes under 30 seconds</Text>
      <Text style={styles.link} onPress={handleGoHome}>
        Go to home →
      </Text>
    </View>
  );
}

const RING_SIZE = 64;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 4,
    borderColor: Colors.surfaceContainerHigh,
    borderTopColor: Colors.primary,
    marginBottom: Spacing.xl,
  },
  ringGap: {
    flex: 1,
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
