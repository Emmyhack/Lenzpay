import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { SpinningRing } from '@/components/shared/SpinningRing';
import { usePaymentStore } from '@/store/payment';
import { useRewardsStore } from '@/store/rewards';
import { REWARDS_TIERS } from '@/mock/rewards';
import { initiatePayment } from '@/services/payments';
import { MOCK_USER } from '@/mock/data';
import { evaluatePaymentRisk } from '@/services/fraud';
import { useSecurityStore } from '@/store/security';
import { useSourcesStore } from '@/store/sources';
import { useQueryClient } from '@tanstack/react-query';

export default function ProcessingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const merchant = usePaymentStore((s) => s.merchant);
  const mode = usePaymentStore((s) => s.mode);
  const selectedSource = usePaymentStore((s) => s.selectedSource);
  const applyTransactionReward = useRewardsStore((s) => s.applyTransactionReward);
  const rewardsTier = useRewardsStore((s) => s.tier);

  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      // Read straight from the store rather than from props: this effect runs
      // exactly once, and stale closure values here would mean charging the
      // wrong accounts.
      const { payee, plan, attemptNonce, succeed, fail } = usePaymentStore.getState();

      if (!payee || !plan) {
        fail('This payment expired before it could be sent. Please start again.');
        router.replace('/(consumer)/scan/failed');
        return;
      }

      const security = useSecurityStore.getState();
      const alert = evaluatePaymentRisk({
        amountNGN: plan.amount,
        payee,
        plan,
        perTransactionLimitNGN: security.perTxnLimitNGN,
        dailyLimitNGN: security.effectiveDailyLimitNGN(
          REWARDS_TIERS.find((t) => t.name === rewardsTier)?.dailyLimitMultiplier ?? 1
        ),
        spentTodayNGN: security.spentToday(),
        unusualAmountAlertsEnabled: security.unusualAmountAlerts,
      });
      if (alert) security.raiseFraudAlert(alert);
      if (alert?.blocked) {
        fail(`Payment blocked for your protection: ${alert.reasons.join('. ')}.`);
        router.replace('/(consumer)/scan/failed');
        return;
      }

      const result = await initiatePayment({
        payee,
        plan,
        mode: mode ?? 'auto',
        userId: MOCK_USER.id,
        attemptNonce,
        merchantCategory: merchant?.category,
        rewardsTier,
      });

      if (result.success && result.transaction && result.execution?.ok) {
        // Count the payment against today's limit. Recorded only on success,
        // so a blocked or failed attempt never consumes headroom.
        useSecurityStore.getState().recordSpend(result.transaction.amount);
        useSourcesStore.getState().applySettledTransaction(
          result.transaction.id,
          result.execution.legs
        );
        applyTransactionReward(
          result.transaction.id,
          result.transaction.pointsEarned,
          result.transaction.cashbackNGN
        );
        await queryClient.invalidateQueries({ queryKey: ['transactions'] });
        succeed(
          result.transaction,
          result.execution.legs,
          result.execution.uncollectedLegs ?? []
        );
        router.replace('/(consumer)/scan/success');
      } else {
        fail(
          result.failureReason ?? 'Payment could not be completed.',
          result.needsManualReview
        );
        router.replace('/(consumer)/scan/failed');
      }
    })();
  }, [merchant, mode, rewardsTier, applyTransactionReward, queryClient, router]);

  const sourceLabel = selectedSource?.label ?? 'your sources';

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
