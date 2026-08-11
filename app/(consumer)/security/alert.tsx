import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSecurityStore } from '@/store/security';
import { showToast } from '@/components/ui/Toast';

export default function FraudAlertScreen() {
  const router = useRouter();
  const clearFraudAlert = useSecurityStore((s) => s.clearFraudAlert);
  const alert = useSecurityStore((s) => s.fraudAlert);

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true);
    opacity.value = withRepeat(withSequence(withTiming(0.6, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true);
  }, [scale, opacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handleWasMe = () => {
    clearFraudAlert();
    showToast('success', 'Thanks for confirming');
    router.back();
  };

  const handleSecure = () => {
    clearFraudAlert();
    showToast('success', 'Account secured', 'We’ve signed out unrecognized devices.');
    router.push('/(consumer)/security/devices');
  };

  if (!alert) {
    return (
      <View style={styles.wrap}>
        <ScreenHeader title="Security Alert" />
        <View style={styles.body}>
          <Icon name="shield-checkmark" size={56} color={Colors.success} />
          <Text style={styles.title}>No active alerts</Text>
          <Text style={styles.explanation}>We haven't detected any payment activity that needs your review.</Text>
          <View style={styles.actions}>
            <Button label="Back to Security" onPress={() => router.back()} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Security Alert" />

      <View style={styles.body}>
        <Animated.View style={[styles.ring, ringStyle]}>
          <Icon name="warning" size={36} color={Colors.error} />
        </Animated.View>

        <Text style={styles.title}>Unusual activity flagged</Text>
        <Text style={styles.explanation}>
          We {alert.blocked ? 'blocked' : 'flagged'} a payment of ₦{alert.amountNGN.toLocaleString()} to{' '}
          {alert.payeeName} at {alert.occurredAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.
          {alert.blocked ? ' No funds were moved.' : ' Review it before continuing.'}
        </Text>

        <View style={styles.reasonList}>
          {alert.reasons.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Icon name="alert-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.prompt}>Was this you?</Text>

        <View style={styles.actions}>
          <Button label="Yes, it was me" onPress={handleWasMe} />
          <Button label="No, secure my account" variant="destructive" onPress={handleSecure} />
        </View>
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
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  ring: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.errorContainer,
    borderWidth: 2,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineMd.fontSize,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  explanation: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 22,
  },
  prompt: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  actions: {
    width: '100%',
    gap: Spacing.md,
  },
  reasonList: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.errorContainer,
  },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reasonText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
});
