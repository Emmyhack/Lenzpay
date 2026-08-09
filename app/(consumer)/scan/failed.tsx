import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { usePaymentStore } from '@/store/payment';

export default function FailedScreen() {
  const router = useRouter();
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const merchant = usePaymentStore((s) => s.merchant);
  const failureReason = usePaymentStore((s) => s.failureReason);
  const reset = usePaymentStore((s) => s.reset);

  const [expanded, setExpanded] = useState(false);
  const ringScale = useSharedValue(0);

  useEffect(() => {
    ringScale.value = withSpring(1, { damping: 6, stiffness: 180 });
  }, [ringScale]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));

  const handleTryAnother = () => {
    router.replace('/(consumer)/scan/source');
  };

  const handleAdjustLimit = () => {
    router.push('/(consumer)/security/limits');
  };

  const handleBackHome = () => {
    reset();
    router.replace('/(consumer)');
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, ringStyle]}>
        <Text style={styles.cross}>✕</Text>
      </Animated.View>

      <Text style={styles.title}>Payment Failed</Text>
      <Text style={styles.reason}>{failureReason ?? `We couldn't send ₦${amountNGN.toLocaleString()} to ${merchant?.name ?? 'this merchant'}.`}</Text>

      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.accordionHeader}>
        <Text style={styles.accordionTitle}>What happened?</Text>
        <Text style={styles.accordionChevron}>{expanded ? '︿' : '﹀'}</Text>
      </TouchableOpacity>
      {expanded ? (
        <Text style={styles.accordionBody}>
          Your source declined the transaction, or a network timeout interrupted it before completion. No funds
          were moved. You can retry with the same source or choose a different one.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label="Try Another Source →" onPress={handleTryAnother} variant="destructive" />
        <Button label="Adjust Limit" onPress={handleAdjustLimit} variant="secondary" />
        <Button label="Back to Home" onPress={handleBackHome} variant="tertiary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.errorContainer,
    borderWidth: 2,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  cross: {
    fontSize: 36,
    color: Colors.error,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displaySm.fontSize,
    color: Colors.onSurface,
  },
  reason: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xl,
    padding: Spacing.sm,
  },
  accordionTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
  },
  accordionChevron: {
    fontSize: 12,
    color: Colors.primary,
  },
  accordionBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  actions: {
    width: '100%',
    marginTop: Spacing.xxl,
    gap: Spacing.md,
  },
});
