import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SourceList } from '@/components/payment/SourceList';
import { Button } from '@/components/ui/Button';
import { usePaymentLogic } from '@/hooks/usePaymentLogic';
import { useSourcesStore } from '@/store/sources';
import { usePaymentStore } from '@/store/payment';
import type { PaymentMode } from '@/types/payment';

export default function SourceScreen() {
  const router = useRouter();
  const sources = useSourcesStore((s) => s.sources);
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const selectSource = usePaymentStore((s) => s.selectSource);
  const setMode = usePaymentStore((s) => s.setMode);

  const [uiMode, setUiMode] = useState<'auto' | 'manual'>('auto');
  const [manualSelectedId, setManualSelectedId] = useState<string | undefined>();

  const result = usePaymentLogic(amountNGN, sources);

  const manualSource = sources.find((s) => s.id === manualSelectedId);
  const canPay = uiMode === 'auto' ? result.isCoverable : !!manualSource;

  const pointsPreview = useMemo(() => Math.round(amountNGN * 0.005), [amountNGN]);

  const handlePay = () => {
    if (uiMode === 'auto') {
      if (result.mode === 'auto' && result.autoSelected) {
        selectSource(result.autoSelected);
        setMode('auto' as PaymentMode);
        router.push('/(consumer)/scan/confirm');
      } else if (result.mode === 'split' && result.isCoverable) {
        setMode('split');
        router.push('/(consumer)/scan/split');
      }
    } else if (manualSource) {
      selectSource(manualSource);
      setMode('manual');
      router.push('/(consumer)/scan/confirm');
    }
  };

  const showSplitNotice = uiMode === 'auto' && result.mode === 'split' && result.isCoverable;

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Choose Source" subtitle={`Paying ₦${amountNGN.toLocaleString()}`} />

      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={() => setUiMode('auto')}
          style={[styles.toggleTab, uiMode === 'auto' && styles.toggleTabActive]}
        >
          <Text style={[styles.toggleText, uiMode === 'auto' && styles.toggleTextActive]}>⚡ Auto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setUiMode('manual')}
          style={[styles.toggleTab, uiMode === 'manual' && styles.toggleTabActive]}
        >
          <Text style={[styles.toggleText, uiMode === 'manual' && styles.toggleTextActive]}>👆 Manual</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {showSplitNotice ? (
          <View style={styles.splitNotice}>
            <Text style={styles.splitNoticeText}>
              🔀 No single account covers this — we'll split it across your sources.
            </Text>
          </View>
        ) : null}

        {!result.isCoverable && result.deficit > 0 ? (
          <View style={styles.deficitNotice}>
            <Text style={styles.deficitText}>
              You're short by ₦{result.deficit.toLocaleString()} across all sources.
            </Text>
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
          label={amountNGN > 0 ? `Pay ₦${amountNGN.toLocaleString()} →` : 'Enter an amount'}
          onPress={handlePay}
          disabled={!canPay}
        />
        {canPay ? <Text style={styles.pointsPreview}>⭐ You'll earn ~{pointsPreview} pts</Text> : null}
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
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    alignItems: 'center',
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
    backgroundColor: Colors.warning + '18',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  splitNoticeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.warning,
  },
  deficitNotice: {
    backgroundColor: Colors.errorContainer,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  deficitText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.errorDim,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
  },
  pointsPreview: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
