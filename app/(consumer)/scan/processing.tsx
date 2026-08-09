import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { SpinningRing } from '@/components/shared/SpinningRing';
import { usePaymentStore } from '@/store/payment';
import { useRewardsStore } from '@/store/rewards';
import { initiatePayment } from '@/services/payments';

export default function ProcessingScreen() {
  const router = useRouter();
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const merchant = usePaymentStore((s) => s.merchant);
  const mode = usePaymentStore((s) => s.mode);
  const selectedSource = usePaymentStore((s) => s.selectedSource);
  const splitAllocations = usePaymentStore((s) => s.splitAllocations);
  const succeed = usePaymentStore((s) => s.succeed);
  const fail = usePaymentStore((s) => s.fail);
  const addPoints = useRewardsStore((s) => s.addPoints);

  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const result = await initiatePayment({
        merchantId: merchant?.id ?? 'manual',
        amountNGN,
        mode: mode ?? 'auto',
        sourceId: selectedSource?.id,
        splitAllocations: splitAllocations ?? undefined,
      });

      if (result.success && result.transaction) {
        addPoints(result.transaction.pointsEarned, result.transaction.cashbackNGN);
        succeed(result.transaction);
        router.replace('/(consumer)/scan/success');
      } else {
        fail(result.failureReason ?? 'Payment could not be completed.');
        router.replace('/(consumer)/scan/failed');
      }
    })();
  }, [amountNGN, merchant, mode, selectedSource, splitAllocations, addPoints, succeed, fail, router]);

  const sourceLabel =
    mode === 'split' ? `${splitAllocations?.length ?? 0} sources` : selectedSource?.label ?? 'your source';

  return (
    <View style={styles.wrap}>
      <SpinningRing />
      <Text style={styles.title}>Processing...</Text>
      <Text style={styles.subtitle}>
        Sending ₦{amountNGN.toLocaleString()} to {merchant?.name ?? 'merchant'}
      </Text>
      <Text style={styles.via}>via {sourceLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.headlineMd.fontSize,
    color: Colors.onSurface,
    marginTop: Spacing.xl,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  via: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.xs,
  },
});
