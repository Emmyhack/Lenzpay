import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SourceList } from '@/components/payment/SourceList';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { describePlanFailure, usePaymentLogic } from '@/hooks/usePaymentLogic';
import { useSourcesStore } from '@/store/sources';
import { usePaymentStore } from '@/store/payment';
import { useRewardsStore } from '@/store/rewards';
import { REWARDS_TIERS } from '@/mock/rewards';

export default function SourceScreen() {
  const router = useRouter();
  const sources = useSourcesStore((s) => s.sources);
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const selectSource = usePaymentStore((s) => s.selectSource);
  const setMode = usePaymentStore((s) => s.setMode);
  const setPlan = usePaymentStore((s) => s.setPlan);
  const tier = useRewardsStore((s) => s.tier);
  // The tier's FX benefit is applied to the quote itself, so the rate the user
  // sees on the confirm screen is the discounted one they were promised.
  const spreadDiscount =
    REWARDS_TIERS.find((t) => t.name === tier)?.fxSpreadDiscount ?? 0;

  const [uiMode, setUiMode] = useState<'auto' | 'manual'>('auto');
  const [manualSelectedId, setManualSelectedId] = useState<string | undefined>();

  // In Manual mode the engine re-plans around the user's pick, so the FX rate
  // and fees shown on the confirm screen match the source they actually chose.
  const result = usePaymentLogic(amountNGN, sources, {
    preferredSourceId: uiMode === 'manual' ? manualSelectedId : undefined,
    spreadDiscount,
  });

  const manualSource = sources.find((s) => s.id === manualSelectedId);
  const canPay = uiMode === 'auto' ? result.isCoverable : !!manualSource && result.isCoverable;

  const pointsPreview = useMemo(() => Math.round(amountNGN * 0.005), [amountNGN]);
  const failureMessage = describePlanFailure(result.failureReason, result.deficit);

  const handlePay = () => {
    if (!result.plan) return;
    setPlan(result.plan);

    if (uiMode === 'manual' && manualSource) {
      selectSource(manualSource);
      setMode('manual');
      router.push('/(consumer)/scan/confirm');
      return;
    }

    if (result.plan.kind === 'single_source') {
      selectSource(result.plan.legs[0].source);
      setMode('auto');
      router.push('/(consumer)/scan/confirm');
    } else {
      setMode('split');
      router.push('/(consumer)/scan/split');
    }
  };

  const showSplitNotice = uiMode === 'auto' && result.plan?.kind === 'waterfall';

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Choose Source" subtitle={`Paying ₦${amountNGN.toLocaleString()}`} />

      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={() => setUiMode('auto')}
          style={[styles.toggleTab, uiMode === 'auto' && styles.toggleTabActive]}
        >
          <Icon name="flash" size={14} color={uiMode === 'auto' ? Colors.onPrimary : Colors.onSurfaceVariant} />
          <Text style={[styles.toggleText, uiMode === 'auto' && styles.toggleTextActive]}>Auto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setUiMode('manual')}
          style={[styles.toggleTab, uiMode === 'manual' && styles.toggleTabActive]}
        >
          <Icon name="hand-left" size={14} color={uiMode === 'manual' ? Colors.onPrimary : Colors.onSurfaceVariant} />
          <Text style={[styles.toggleText, uiMode === 'manual' && styles.toggleTextActive]}>Manual</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {showSplitNotice ? (
          <View style={styles.splitNotice}>
            <Icon name="shuffle" size={16} color={Colors.warning} />
            <Text style={styles.splitNoticeText}>
              No single account covers this — we'll split it across{' '}
              {result.plan?.legs.length ?? 0} sources.
            </Text>
          </View>
        ) : null}

        {result.totalFees > 0 ? (
          <View style={styles.feeNotice}>
            <Icon name="swap-horizontal" size={16} color={Colors.onSurfaceVariant} />
            <Text style={styles.feeNoticeText}>
              Includes ₦{Math.round(result.totalFees).toLocaleString()} conversion cost.
            </Text>
          </View>
        ) : null}

        {failureMessage ? (
          <View style={styles.deficitNotice}>
            <Icon name="alert-circle" size={16} color={Colors.errorDim} />
            <Text style={styles.deficitText}>{failureMessage}</Text>
          </View>
        ) : null}

        <SourceList
          sources={sources}
          amountNGN={amountNGN}
          result={result}
          mode={uiMode}
          manualSelectedId={manualSelectedId}
          onSelectManual={(source) => setManualSelectedId(source.id)}
        />
      </View>

      <View style={styles.footer}>
        <Button
          label={amountNGN > 0 ? `Pay ₦${amountNGN.toLocaleString()}` : 'Enter an amount'}
          trailingArrow={amountNGN > 0}
          onPress={handlePay}
          disabled={!canPay}
        />
        {canPay ? (
          <View style={styles.pointsPreviewRow}>
            <Icon name="star" size={12} color={Colors.primary} />
            <Text style={styles.pointsPreview}>You'll earn ~{pointsPreview} pts</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    marginHorizontal: Spacing.xl,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  toggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  toggleTabActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  toggleTextActive: {
    color: Colors.onPrimary,
  },
  list: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  splitNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '18',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  splitNoticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.warning,
  },
  feeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  feeNoticeText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  deficitNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.errorContainer,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  deficitText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.errorDim,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
  },
  pointsPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  pointsPreview: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
  },
});
