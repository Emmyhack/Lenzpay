import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useRewardsStore } from '@/store/rewards';
import { REWARD_POINT_VALUE } from '@/mock/data';
import { redeemPoints } from '@/services/rewards';
import { showToast } from '@/components/ui/Toast';
import type { RedemptionMethod } from '@/types/rewards';

const METHODS: { key: RedemptionMethod; label: string; icon: IconName; subtitle: string }[] = [
  { key: 'cashback', label: 'Cashback', icon: 'cash', subtitle: 'Straight to your default source' },
  { key: 'airtime', label: 'Airtime', icon: 'wifi', subtitle: 'Top up your phone instantly' },
  { key: 'bank_transfer', label: 'Bank Transfer', icon: 'business', subtitle: '1-3 business days' },
];

/**
 * Redemption uses the same value points are accrued at.
 *
 * This was hard-coded at 2 points = ₦1 (₦0.50 a point) while accrual provisions
 * ₦0.05 a point — every redemption paid out ten times what was set aside. One
 * constant now drives both, and `rewards-economics.test.ts` asserts they agree.
 */
const NGN_PER_POINT = REWARD_POINT_VALUE;

export default function RedeemScreen() {
  const router = useRouter();
  const points = useRewardsStore((s) => s.points);
  const redeemFromStore = useRewardsStore((s) => s.redeemPoints);

  const [method, setMethod] = useState<RedemptionMethod>('cashback');
  const [ratio, setRatio] = useState(0.5);
  const [redeeming, setRedeeming] = useState(false);

  const pointsToRedeem = Math.round(points * ratio);
  const valueNGN = Math.floor(pointsToRedeem * NGN_PER_POINT);

  const handleRedeem = async () => {
    if (pointsToRedeem <= 0) return;
    setRedeeming(true);
    await redeemPoints(method, pointsToRedeem);
    redeemFromStore(pointsToRedeem);
    setRedeeming(false);
    showToast('success', `Redeemed ₦${valueNGN.toLocaleString()}`);
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Redeem Points" subtitle={`${points.toLocaleString()} pts available`} />

      <View style={styles.body}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => setMethod(m.key)}
            style={[styles.methodCard, method === m.key && styles.methodCardActive]}
            activeOpacity={0.85}
          >
            <View style={styles.methodIconWrap}>
              <Icon name={m.icon} size={18} color={Colors.onSurfaceVariant} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>{m.label}</Text>
              <Text style={styles.methodSubtitle}>{m.subtitle}</Text>
            </View>
            {method === m.key ? <Icon name="checkmark-circle" size={20} color={Colors.primary} /> : null}
          </TouchableOpacity>
        ))}

        <View style={styles.sliderSection}>
          <Text style={styles.sliderLabel}>How many points?</Text>
          <Slider value={ratio} onChange={setRatio} />
          <Text style={styles.previewText}>
            {pointsToRedeem.toLocaleString()} pts = ₦{valueNGN.toLocaleString()}
          </Text>
        </View>

        <Button
          label={`Redeem ₦${valueNGN.toLocaleString()}`}
          onPress={handleRedeem}
          loading={redeeming}
          disabled={pointsToRedeem <= 0}
          style={styles.submit}
        />
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
    paddingHorizontal: Spacing.xl,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  methodCardActive: {
    borderColor: Colors.primary,
  },
  methodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: { flex: 1 },
  methodLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  methodSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  sliderSection: {
    marginTop: Spacing.xxl,
  },
  sliderLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.lg,
  },
  previewText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  submit: {
    marginTop: Spacing.xxl,
  },
});
