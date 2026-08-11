import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRewardsStore } from '@/store/rewards';
import { CASHBACK_RATES, CATEGORY_ICON, REWARD_POINT_VALUE } from '@/mock/data';
import { REWARDS_TIERS, TIER_ICON } from '@/mock/rewards';
import { fetchTransactions } from '@/services/payments';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const CATEGORY_LABEL: Record<string, string> = {
  transport: 'Transport',
  food: 'Food & drink',
  shopping: 'Shopping',
  crypto: 'Crypto',
  other: 'Everything else',
};

/**
 * Rates are fractions of a percent, so `toFixed(1)` collapsed three of the five
 * categories to an identical "0.1%". Two decimals is the minimum that keeps
 * them distinguishable.
 */
function formatRate(rate: number): string {
  const percent = rate * 100;
  return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}

export default function RewardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { points, tier, lifetimeCashbackNGN } = useRewardsStore();
  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'all'],
    queryFn: fetchTransactions,
  });

  const currentTier = REWARDS_TIERS.find((t) => t.name === tier) ?? REWARDS_TIERS[0];
  const nextTier = REWARDS_TIERS.find((t) => t.minPoints > currentTier.minPoints);

  const progress = useMemo(() => {
    if (!currentTier.nextTierPoints) return 1;
    const span = currentTier.nextTierPoints - currentTier.minPoints;
    return Math.min(1, Math.max(0, (points - currentTier.minPoints) / span));
  }, [currentTier, points]);

  /** What the balance is actually worth — the number the user came for. */
  const pointsValueNGN = Math.floor(points * REWARD_POINT_VALUE);

  const bar = useSharedValue(0);
  useEffect(() => {
    bar.value = reduceMotion
      ? progress
      : withTiming(progress, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion, bar]);
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

  const pointsHistory = (transactions ?? []).filter((t) => t.pointsEarned > 0).slice(0, 4);

  return (
    <View style={styles.wrap}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Value first. A points balance on its own is a number the user has to
            translate; showing what it is worth is the whole point of a
            rewards programme. */}
        <Text style={styles.eyebrow}>Your points are worth</Text>
        <Text style={styles.value}>₦{pointsValueNGN.toLocaleString()}</Text>
        <Text style={styles.subValue}>
          {points.toLocaleString()} pts · ₦{REWARD_POINT_VALUE.toFixed(2)} each
        </Text>

        <View style={styles.actions}>
          <Button
            label="Redeem"
            onPress={() => router.push('/(consumer)/rewards/redeem')}
            disabled={pointsValueNGN < 1}
            fullWidth={false}
            style={styles.redeemButton}
          />
          <TouchableOpacity
            style={styles.tierPill}
            onPress={() => router.push('/(consumer)/rewards/tiers')}
            accessibilityRole="button"
            accessibilityLabel={`${tier} tier, view benefits`}
          >
            <Icon name={TIER_ICON[tier].name} size={15} color={TIER_ICON[tier].color} />
            <Text style={styles.tierPillText}>{tier}</Text>
            <Icon name="chevron-forward" size={13} color={Colors.onSurfaceMuted} />
          </TouchableOpacity>
        </View>

        {/* Progress states what the next tier actually gives, not just that one
            exists — "600 pts away" is only motivating if you know what for. */}
        <View style={styles.progressCard}>
          <View style={styles.progressHead}>
            <Text style={styles.progressTier}>{tier}</Text>
            {nextTier ? <Text style={styles.progressTierNext}>{nextTier.name}</Text> : null}
          </View>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, barStyle]} />
          </View>

          {nextTier && currentTier.nextTierPoints ? (
            <Text style={styles.progressLabel}>
              <Text style={styles.progressStrong}>
                {(currentTier.nextTierPoints - points).toLocaleString()} pts
              </Text>{' '}
              to {nextTier.name} — {nextTier.cashbackMultiplier}× cashback and{' '}
              {Math.round(nextTier.fxSpreadDiscount * 100)}% off FX spread
            </Text>
          ) : (
            <View style={styles.topTierRow}>
              <Icon name="sparkles" size={13} color={Colors.warning} />
              <Text style={styles.progressLabel}>Top tier — every benefit unlocked</Text>
            </View>
          )}
        </View>

        {/* Benefits are stated as live facts because they now are: the
            multiplier is applied at settlement, the FX discount is quoted into
            the rate, and the limit uplift is enforced by the risk check. */}
        <View style={styles.section}>
          <SectionTitle
            title={`Active as ${tier}`}
            rightLabel="All tiers"
            onPressRight={() => router.push('/(consumer)/rewards/tiers')}
            padded
          />
          <View style={styles.benefitRow}>
            <Benefit
              icon="cash"
              value={`${currentTier.cashbackMultiplier}×`}
              label="cashback"
            />
            <Benefit
              icon="swap-horizontal"
              value={`${Math.round(currentTier.fxSpreadDiscount * 100)}%`}
              label="off FX spread"
              muted={currentTier.fxSpreadDiscount === 0}
            />
            <Benefit
              icon="trending-up"
              value={`${currentTier.dailyLimitMultiplier}×`}
              label="daily limit"
              muted={currentTier.dailyLimitMultiplier === 1}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Cashback by category" padded />
          <Text style={styles.sectionNote}>
            Up to these rates at your {currentTier.cashbackMultiplier}× {tier} multiplier. Very
            large payments earn a little less, since fees on them are capped.
          </Text>
          <View style={styles.rateList}>
            {Object.entries(CASHBACK_RATES).map(([key, rate]) => {
              const effective = rate * currentTier.cashbackMultiplier;
              return (
                <View key={key} style={styles.rateRow}>
                  <View style={styles.rateIcon}>
                    <Icon
                      name={CATEGORY_ICON[key] ?? CATEGORY_ICON.other}
                      size={15}
                      color={Colors.onSurfaceVariant}
                    />
                  </View>
                  <Text style={styles.rateLabel}>{CATEGORY_LABEL[key] ?? key}</Text>
                  {currentTier.cashbackMultiplier > 1 ? (
                    <Text style={styles.rateBase}>{formatRate(rate)}</Text>
                  ) : null}
                  <Text style={styles.rateValue}>{formatRate(effective)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle
            title="Recent earnings"
            rightLabel={lifetimeCashbackNGN > 0 ? `₦${lifetimeCashbackNGN.toLocaleString()} lifetime` : undefined}
            padded
          />
          {pointsHistory.length > 0 ? (
            <View style={styles.historyList}>
              {pointsHistory.map((txn, index) => (
                <View key={txn.id} style={[styles.historyRow, index > 0 && styles.historyDivided]}>
                  <View style={styles.historyIconWrap}>
                    <Icon
                      name={CATEGORY_ICON[txn.category] ?? CATEGORY_ICON.other}
                      size={15}
                      color={Colors.onSurfaceVariant}
                    />
                  </View>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyName} numberOfLines={1}>
                      {txn.merchantName}
                    </Text>
                    <Text style={styles.historyDate}>
                      ₦{txn.amount.toLocaleString()} ·{' '}
                      {txn.timestamp.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyPoints}>+{txn.pointsEarned} pts</Text>
                    {txn.cashbackNGN > 0 ? (
                      <Text style={styles.historyCash}>
                        ₦{txn.cashbackNGN.toLocaleString()} back
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="star-outline"
              title="No points yet"
              message="Points land here after your first payment."
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Benefit({
  icon,
  value,
  label,
  muted = false,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  value: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <View style={[styles.benefit, muted && styles.benefitMuted]}>
      <Icon name={icon} size={16} color={muted ? Colors.onSurfaceMuted : Colors.primary} />
      <Text style={[styles.benefitValue, muted && styles.benefitValueMuted]}>{value}</Text>
      <Text style={styles.benefitLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing.xxxl },

  eyebrow: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xl,
  },
  value: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayLg.fontSize,
    lineHeight: Typography.displayLg.lineHeight,
    letterSpacing: Typography.displayLg.letterSpacing,
    color: Colors.onSurface,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
  },
  subValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    paddingHorizontal: Spacing.xl,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  redeemButton: { flex: 1 },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  tierPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
  },

  progressCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTier: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
  },
  progressTierNext: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.primary },
  progressLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: Colors.onSurfaceVariant,
  },
  progressStrong: { fontFamily: 'Inter_600SemiBold', color: Colors.onSurface },
  topTierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

  section: { marginTop: Spacing.xxl },
  sectionNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    marginTop: -Spacing.xs,
  },

  benefitRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  benefit: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  benefitMuted: { opacity: 0.55 },
  benefitValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
    marginTop: Spacing.xs,
  },
  benefitValueMuted: { color: Colors.onSurfaceVariant },
  benefitLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    textAlign: 'center',
  },

  rateList: { paddingHorizontal: Spacing.xl },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rateIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateLabel: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  rateBase: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    textDecorationLine: 'line-through',
  },
  rateValue: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.primary,
    minWidth: 52,
    textAlign: 'right',
  },

  historyList: { paddingHorizontal: Spacing.xl },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  historyDivided: {
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  historyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  historyRight: { alignItems: 'flex-end' },
  historyPoints: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  historyCash: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: 2,
  },
});
