import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { ToggleRow } from '@/components/shared/ToggleRow';
import { useSecurityStore } from '@/store/security';

function PulseDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      true
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.pulseDot, style]} />;
}

export default function SecurityHubScreen() {
  const router = useRouter();
  const security = useSecurityStore();

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Security" />

      <ScrollView contentContainerStyle={styles.content}>
        {security.hasFraudAlert ? (
          <TouchableOpacity onPress={() => router.push('/(consumer)/security/alert')} style={styles.alertCard}>
            <PulseDot />
            <View style={styles.alertInfo}>
              <Text style={styles.alertTitle}>Unusual activity flagged</Text>
              <Text style={styles.alertSubtitle}>A payment attempt from a new device was blocked.</Text>
            </View>
            <Text style={styles.alertLink}>View Details ›</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.section}>
          <SectionTitle title="Authentication" />
          <View style={styles.card}>
            <ToggleRow title="Face ID" subtitle="Use biometrics to confirm payments" value={security.faceIdEnabled} onValueChange={security.toggleFaceId} />
            <ToggleRow title="Transaction PIN" subtitle="Require PIN for every payment" value={security.pinRequiredEnabled} onValueChange={security.togglePinRequired} />
            <ToggleRow title="Skip PIN below ₦500" subtitle="Faster checkout for small payments" value={security.skipPinBelowThreshold} onValueChange={security.toggleSkipPinBelowThreshold} last />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Fraud Protection" />
          <View style={styles.card}>
            <ToggleRow title="New device alerts" value={security.newDeviceAlerts} onValueChange={security.toggleNewDeviceAlerts} />
            <ToggleRow title="Unusual amount alerts" value={security.unusualAmountAlerts} onValueChange={security.toggleUnusualAmountAlerts} />
            <ToggleRow title="Block international transactions" value={security.internationalBlocked} onValueChange={security.toggleInternationalBlocked} />
            <ToggleRow title="Auto-lock after failed PIN" value={security.autoLockAfterFailedPin} onValueChange={security.toggleAutoLockAfterFailedPin} last />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Limits" rightLabel="Edit →" onPressRight={() => router.push('/(consumer)/security/limits')} />
          <View style={styles.card}>
            <LimitRow label="Daily limit" value={`₦${security.dailyLimitNGN.toLocaleString()}`} />
            <LimitRow label="Per-transaction limit" value={`₦${security.perTxnLimitNGN.toLocaleString()}`} />
            <LimitRow label="Skip-PIN threshold" value="₦500" />
            <LimitRow label="International" value={security.internationalBlocked ? 'Blocked' : 'Allowed'} last />
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/(consumer)/security/pin-change')} style={styles.linkRow}>
          <Text style={styles.linkText}>Change PIN</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(consumer)/security/devices')} style={styles.linkRow}>
          <Text style={styles.linkText}>Trusted Devices</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function LimitRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.limitRow, !last && styles.divider]}>
      <Text style={styles.limitLabel}>{label}</Text>
      <Text style={styles.limitValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.errorContainer,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
  alertInfo: { flex: 1 },
  alertTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.error,
  },
  alertSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  alertLink: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.error,
  },
  section: {
    marginTop: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  limitLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  limitValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  linkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  chevron: {
    color: Colors.onSurfaceMuted,
    fontSize: 18,
  },
});
