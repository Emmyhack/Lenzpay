import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { RevenueChart } from '@/components/charts/RevenueChart';
import { PeakHoursHeatmap } from '@/components/charts/PeakHoursHeatmap';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { REVENUE_LAST_7_DAYS, PEAK_HOURS } from '@/mock/merchant';

export default function MerchantAnalyticsScreen() {
  const totalRevenue = useMemo(() => REVENUE_LAST_7_DAYS.reduce((sum, d) => sum + d.amountNGN, 0), []);
  const avgDaily = Math.round(totalRevenue / REVENUE_LAST_7_DAYS.length);
  const busiestHour = PEAK_HOURS.indexOf(Math.max(...PEAK_HOURS));

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Analytics" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>7-Day Revenue</Text>
            <Text style={styles.statValue}>₦{totalRevenue.toLocaleString()}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Daily Average</Text>
            <Text style={styles.statValue}>₦{avgDaily.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Revenue Trend" />
          <View style={styles.chartCard}>
            <ChartErrorBoundary>
              <RevenueChart data={REVENUE_LAST_7_DAYS} />
            </ChartErrorBoundary>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Peak Hours" />
          <View style={styles.chartCard}>
            <PeakHoursHeatmap hourlyCounts={PEAK_HOURS} />
            <Text style={styles.busiestText}>
              Busiest around {busiestHour === 0 ? '12am' : busiestHour < 12 ? `${busiestHour}am` : busiestHour === 12 ? '12pm' : `${busiestHour - 12}pm`}
            </Text>
          </View>
        </View>
      </ScrollView>
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
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
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
  chartCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  busiestText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
