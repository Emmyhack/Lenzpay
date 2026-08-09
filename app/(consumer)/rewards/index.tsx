import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRewardsStore } from '@/store/rewards';
import { CASHBACK_RATES } from '@/mock/data';
import { REWARDS_TIERS } from '@/mock/rewards';
import { fetchTransactions } from '@/services/payments';

const TIER_ICON: Record<string, string> = { Bronze: '🥉', Silver: '🥈', Gold: '⭐', Platinum: '💎' };
const CATEGORY_LABEL: Record<string, string> = {
  transport: 'Transport',
  food: 'Food',
  shopping: 'Shopping',
  crypto: 'Crypto',
  other: 'Other',
};

export default function RewardsScreen() {
  const router = useRouter();
  const { points, tier, lifetimeCashbackNGN } = useRewardsStore();
  const { data: transactions } = useQuery({ queryKey: ['transactions', 'all'], queryFn: fetchTransactions });

  const currentTier = REWARDS_TIERS.find((t) => t.name === tier) ?? REWARDS_TIERS[0];
  const progress = useMemo(() => {
    if (!currentTier.nextTierPoints) return 1;
    const span = currentTier.nextTierPoints - currentTier.minPoints;
    return Math.min(1, (points - currentTier.minPoints) / span);
  }, [currentTier, points]);

  const pointsHistory = (transactions ?? []).filter((t) => t.pointsEarned > 0).slice(0, 5);

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Rewards" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.tierBadge}>
            {TIER_ICON[tier]} {tier}
          </Text>
          <Text style={styles.pointsLabel}>POINTS</Text>
          <Text style={styles.points}>{points.toLocaleString()}</Text>
          <Text style={styles.cashback}>₦{lifetimeCashbackNGN.toLocaleString()} lifetime cashback</Text>

          {currentTier.nextTierPoints ? (
            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {(currentTier.nextTierPoints - points).toLocaleString()} pts to next tier
              </Text>
            </View>
          ) : (
            <Text style={styles.progressLabel}>You've reached the top tier 🎉</Text>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Cashback Rates" rightLabel="Tier benefits →" onPressRight={() => router.push('/(consumer)/rewards/tiers')} padded />
          <View style={styles.rateGrid}>
            {Object.entries(CASHBACK_RATES).map(([key, rate]) => (
              <View key={key} style={styles.rateCard}>
                <Text style={styles.rateLabel}>{CATEGORY_LABEL[key] ?? key}</Text>
                <Text style={styles.rateValue}>{(rate * 100).toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Points History" padded />
          {pointsHistory.length > 0 ? (
            pointsHistory.map((txn) => (
              <View key={txn.id} style={styles.historyRow}>
                <Text style={styles.historyIcon}>{txn.merchantIcon}</Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyName}>{txn.merchantName}</Text>
                  <Text style={styles.historyDate}>{txn.timestamp.toLocaleDateString()}</Text>
                </View>
                <Text style={styles.historyPoints}>+{txn.pointsEarned} pts</Text>
              </View>
            ))
          ) : (
            <EmptyState icon="⭐" title="No points yet" message="Points show up here after your first payment." />
          )}
        </View>

        <View style={styles.footer}>
          <Button label="Redeem Points →" onPress={() => router.push('/(consumer)/rewards/redeem')} disabled={points === 0} />
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
    paddingBottom: Spacing.xxxl,
  },
  hero: {
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    padding: Spacing.xl,
    alignItems: 'center',
  },
  tierBadge: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  pointsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
  },
  points: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayLg.fontSize,
    lineHeight: Typography.displayLg.lineHeight,
    color: Colors.primary,
  },
  cashback: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  progressSection: {
    width: '100%',
    marginTop: Spacing.xl,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  progressLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  section: {
    marginTop: Spacing.xxl,
  },
  rateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  rateCard: {
    width: '47%',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  rateLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  rateValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  historyIcon: { fontSize: 20 },
  historyInfo: { flex: 1 },
  historyName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
  },
  historyDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: 2,
  },
  historyPoints: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
  },
});
