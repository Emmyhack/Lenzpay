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

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Security Alert" />

      <View style={styles.body}>
        <Animated.View style={[styles.ring, ringStyle]}>
          <Icon name="warning" size={36} color={Colors.error} />
        </Animated.View>

        <Text style={styles.title}>Unusual activity flagged</Text>
        <Text style={styles.explanation}>
          We blocked a payment attempt of ₦45,000 to an unfamiliar merchant from a device we didn't recognize,
          today at 2:14 PM in Lagos, NG. No funds were moved.
        </Text>

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
});
