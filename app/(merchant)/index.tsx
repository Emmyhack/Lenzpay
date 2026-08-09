import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { QuickActions } from '@/components/shared/QuickActions';
import { EmptyState } from '@/components/shared/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useMerchantStore } from '@/store/merchant';
import { fetchMerchantPayments, fetchSettlements } from '@/services/merchant';
import { REVENUE_LAST_7_DAYS } from '@/mock/merchant';

export default function MerchantHomeScreen() {
  const router = useRouter();
  const profile = useMerchantStore((s) => s.profile);

  const { data: payments } = useQuery({ queryKey: ['merchant-payments'], queryFn: fetchMerchantPayments });
  const { data: settlements } = useQuery({ queryKey: ['merchant-settlements'], queryFn: fetchSettlements });

  const todayRevenue = REVENUE_LAST_7_DAYS[REVENUE_LAST_7_DAYS.length - 1]?.amountNGN ?? 0;
  const weekRevenue = useMemo(() => REVENUE_LAST_7_DAYS.reduce((sum, d) => sum + d.amountNGN, 0), []);
  const pendingSettlement = settlements?.find((s) => s.status === 'pending' || s.status === 'processing');

  const quickActions = useMemo(
    () => [
      { key: 'qr', label: 'Show QR', icon: '🔳', iconBg: Colors.primary + '20', onPress: () => router.push('/(merchant)/qr') },
      { key: 'payments', label: 'Payments', icon: '💳', iconBg: Colors.secondary + '20', onPress: () => router.push('/(merchant)/payments') },
      { key: 'analytics', label: 'Analytics', icon: '📊', iconBg: Colors.usd + '20', onPress: () => router.push('/(merchant)/analytics') },
      { key: 'settlement', label: 'Settlement', icon: '🏦', iconBg: Colors.warning + '20', onPress: () => router.push('/(merchant)/settlement') },
    ],
    [router]
  );

  const recentPayments = (payments ?? []).slice(0, 4);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.businessName}>{profile?.businessName ?? 'Your Business'}</Text>
            {profile?.isVerified ? <Badge kind="VERIFIED" /> : null}
          </View>
          <TouchableOpacity onPress={() => router.push('/(merchant)/settings')} style={styles.settingsButton}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.revenueLabel}>TODAY'S REVENUE</Text>
        <Text style={styles.revenue}>₦{todayRevenue.toLocaleString()}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text style={styles.statValue}>₦{weekRevenue.toLocaleString()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Pending Settlement</Text>
            <Text style={styles.statValue}>
              {pendingSettlement ? `₦${pendingSettlement.amountNGN.toLocaleString()}` : '₦0'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <QuickActions actions={quickActions} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Recent Payments" rightLabel="See all →" onPressRight={() => router.push('/(merchant)/payments')} padded />
        {recentPayments.length > 0 ? (
          recentPayments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentPayer}>{payment.payerLabel}</Text>
                <Text style={styles.paymentMeta}>
                  {payment.mode === 'split' ? 'Smart Split' : payment.mode} · {payment.timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>+₦{payment.amountNGN.toLocaleString()}</Text>
            </View>
          ))
        ) : (
          <EmptyState icon="💳" title="No payments yet" message="Share your QR code to start accepting payments." />
        )}
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
    paddingBottom: Spacing.xxxl,
  },
  header: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  businessName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineSm.fontSize,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 16 },
  revenueLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginTop: Spacing.xl,
  },
  revenue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayLg.fontSize,
    lineHeight: Typography.displayLg.lineHeight,
    color: Colors.onSurface,
    marginTop: Spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
  },
  statValue: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing.xxl,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  paymentInfo: {},
  paymentPayer: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
  },
  paymentMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: 2,
  },
  paymentAmount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Colors.success,
  },
});
