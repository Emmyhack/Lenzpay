import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useRewardsStore } from '@/store/rewards';
import { REWARDS_TIERS } from '@/mock/rewards';
import type { RewardsTierName } from '@/types/rewards';

const TIER_ICON: Record<RewardsTierName, string> = { Bronze: '🥉', Silver: '🥈', Gold: '⭐', Platinum: '💎' };

export default function TiersScreen() {
  const currentTier = useRewardsStore((s) => s.tier);
  const [activeTier, setActiveTier] = useState<RewardsTierName>(currentTier);

  const tier = REWARDS_TIERS.find((t) => t.name === activeTier) ?? REWARDS_TIERS[0];
  const nextTier = REWARDS_TIERS[REWARDS_TIERS.findIndex((t) => t.name === activeTier) + 1];

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Tier Benefits" />

      <View style={styles.tabRow}>
        {REWARDS_TIERS.map((t) => (
          <TouchableOpacity
            key={t.name}
            onPress={() => setActiveTier(t.name)}
            style={[styles.tab, activeTier === t.name && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTier === t.name && styles.tabTextActive]}>
              {TIER_ICON[t.name]} {t.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {TIER_ICON[tier.name]} {tier.name}
          </Text>
          <Text style={styles.cardSubtitle}>
            {tier.minPoints.toLocaleString()}+ pts · {tier.cashbackMultiplier}x cashback multiplier
          </Text>

          <View style={styles.benefitsList}>
            {tier.benefits.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Text style={styles.benefitCheck}>✓</Text>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        {nextTier ? (
          <View style={styles.nextCard}>
            <Text style={styles.nextTitle}>
              Next tier adds: {TIER_ICON[nextTier.name]} {nextTier.name}
            </Text>
            {nextTier.benefits.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Text style={styles.nextBullet}>+</Text>
                <Text style={styles.nextBenefitText}>{benefit}</Text>
              </View>
            ))}
            <Text style={styles.nextPoints}>
              Reach {nextTier.minPoints.toLocaleString()} pts to unlock
            </Text>
          </View>
        ) : (
          <Text style={styles.maxedText}>This is the highest tier — enjoy the perks 🎉</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  tabTextActive: {
    color: Colors.onPrimary,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  cardTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineSm.fontSize,
    color: Colors.onSurface,
  },
  cardSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  benefitsList: {
    gap: Spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  benefitCheck: {
    color: Colors.success,
    fontFamily: 'Inter_600SemiBold',
  },
  benefitText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  nextCard: {
    backgroundColor: Colors.secondary + '14',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginTop: Spacing.lg,
  },
  nextTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleSm.fontSize,
    color: Colors.secondary,
    marginBottom: Spacing.md,
  },
  nextBullet: {
    color: Colors.secondary,
    fontFamily: 'Inter_600SemiBold',
  },
  nextBenefitText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  nextPoints: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.secondary,
    marginTop: Spacing.md,
  },
  maxedText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.xxxl,
  },
});
