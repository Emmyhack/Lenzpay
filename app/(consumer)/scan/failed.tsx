import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { usePaymentStore } from '@/store/payment';

export default function FailedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const merchant = usePaymentStore((s) => s.merchant);
  const failureReason = usePaymentStore((s) => s.failureReason);
  const needsManualReview = usePaymentStore((s) => s.needsManualReview);
  const reset = usePaymentStore((s) => s.reset);
  const retry = usePaymentStore((s) => s.retry);

  const [expanded, setExpanded] = useState(false);
  const ringScale = useSharedValue(0);

  useEffect(() => {
    ringScale.value = withSpring(1, { damping: 6, stiffness: 180 });
  }, [ringScale]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));

  const handleTryAnother = () => {
    // New attempt nonce, so the engine treats this as a fresh payment rather
    // than replaying the failed one's idempotency key.
    retry();
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
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xxxl, paddingBottom: insets.bottom + Spacing.xxl },
      ]}
    >
      <Animated.View style={[styles.ring, ringStyle]}>
        <Icon name="close" size={36} color={Colors.error} />
      </Animated.View>

      <Text style={styles.title}>Payment Failed</Text>
      <Text style={styles.reason}>{failureReason ?? `We couldn't send ₦${amountNGN.toLocaleString()} to ${merchant?.name ?? 'this merchant'}.`}</Text>

      {/* Never claim "no funds were moved" when that isn't true (§5.7). */}
      {needsManualReview ? (
        <View style={styles.reviewBanner}>
          <Icon name="alert-circle" size={16} color={Colors.warning} />
          <Text style={styles.reviewText}>
            Part of this payment could not be automatically returned. Our team is reversing it —
            you'll see the funds back shortly. Reference this screen if you contact support.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.accordionHeader}>
        <Text style={styles.accordionTitle}>What happened?</Text>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
      </TouchableOpacity>
      {expanded ? (
        <Text style={styles.accordionBody}>
          {needsManualReview
            ? 'One of your accounts was debited before a later step failed. We have released every hold we could and are reversing the rest manually.'
            : 'Lenz Pay places a hold on every account before moving any money, so a failure at this stage leaves your balances untouched. You can retry with the same sources or choose different ones.'}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label="Try Another Source" trailingArrow onPress={handleTryAnother} variant="destructive" />
        <Button label="Adjust Limit" onPress={handleAdjustLimit} variant="secondary" />
        <Button label="Back to Home" onPress={handleBackHome} variant="tertiary" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    alignItems: 'center',
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
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '18',
    borderRadius: 12,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
  },
  reviewText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.warning,
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
