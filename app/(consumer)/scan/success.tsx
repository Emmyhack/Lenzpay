import { useEffect } from 'react';
import { View, Text, Share, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { usePaymentStore } from '@/store/payment';

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function SuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const transaction = usePaymentStore((s) => s.lastTransaction);
  const legs = usePaymentStore((s) => s.settledLegs);
  const pendingLegs = usePaymentStore((s) => s.pendingCollectionLegs);
  const reset = usePaymentStore((s) => s.reset);

  const totalFees = (legs ?? []).reduce((sum, leg) => sum + leg.feeInSettlementCurrency, 0);
  const merchantWord = transaction?.merchantName ?? 'The merchant';

  const ringScale = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);

  useEffect(() => {
    ringScale.value = withSpring(1, { damping: 6, stiffness: 180 });
    badgeOpacity.value = withDelay(300, withTiming(1, { duration: 300 }));
  }, [ringScale, badgeOpacity]);

  useEffect(() => {
    if (!transaction) router.replace('/(consumer)');
  }, [router, transaction]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badgeOpacity.value }));

  const handleBackHome = () => {
    reset();
    router.replace('/(consumer)');
  };

  const handleShare = () => {
    if (!transaction) return;
    Share.share({
      message: `LenzPay receipt\n₦${transaction.amount.toLocaleString()} to ${transaction.merchantName}\nRef: ${transaction.txnRef}\n${formatTime(transaction.timestamp)}`,
    });
  };

  if (!transaction) {
    return null;
  }

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xxxl, paddingBottom: insets.bottom + Spacing.xxl },
      ]}
    >
      <Animated.View style={[styles.ring, ringStyle]}>
        <Icon name="checkmark" size={36} color={Colors.primary} />
      </Animated.View>

      <Text style={styles.title}>Payment Sent!</Text>
      <Text style={styles.merchant}>{transaction.merchantName}</Text>
      <Text style={styles.amount}>₦{transaction.amount.toLocaleString()}</Text>

      <Animated.View style={[styles.pointsBadge, badgeStyle]}>
        <Icon name="star" size={13} color={Colors.primary} />
        <Text style={styles.pointsText}>+{transaction.pointsEarned} pts earned</Text>
      </Animated.View>

      <Card variant="containerHigh" style={styles.receipt}>
        <ReceiptRow label="Source" value={transaction.sourceLabel} />
        <ReceiptRow label="Mode" value={transaction.mode === 'split' ? 'Smart Split' : transaction.mode === 'auto' ? 'Auto' : 'Manual'} />
        {transaction.fxRate ? <ReceiptRow label="FX Rate" value={transaction.fxRate} /> : null}
        <ReceiptRow label="Cashback" value={`₦${transaction.cashbackNGN.toLocaleString()}`} />
        <ReceiptRow label="Fee" value={`₦${Math.round(totalFees).toLocaleString()}`} />
        <ReceiptRow label="Ref" value={transaction.txnRef} />
        <ReceiptRow label="Time" value={formatTime(transaction.timestamp)} last />
      </Card>

      {/* The merchant has been paid from Lenz's float; these debits land
          shortly. Saying so beats letting the charge arrive unexplained. */}
      {pendingLegs && pendingLegs.length > 0 ? (
        <View style={styles.pendingBanner}>
          <Icon name="time-outline" size={16} color={Colors.onSurfaceVariant} />
          <Text style={styles.pendingText}>
            {pendingLegs
              .map((leg) => `₦${leg.amountInSettlementCurrency.toLocaleString()} from ${leg.source.label}`)
              .join(' and ')}{' '}
            {pendingLegs.length > 1 ? 'are' : 'is'} still being debited. {merchantWord} already has
            the full amount.
          </Text>
        </View>
      ) : null}

      {/* §5.4 — a waterfall receipt has to show which account paid what, or a
          dispute is untraceable. */}
      {legs && legs.length > 1 ? (
        <Card variant="containerHigh" style={styles.receipt}>
          <Text style={styles.breakdownTitle}>Funding breakdown</Text>
          {legs.map((leg, index) => (
            <ReceiptRow
              key={leg.id}
              label={
                leg.sourceCurrency === leg.settlementCurrency
                  ? leg.source.label
                  : `${leg.source.label} (${leg.amountInSourceCurrency} ${leg.sourceCurrency})`
              }
              value={`₦${leg.amountInSettlementCurrency.toLocaleString()}`}
              last={index === legs.length - 1}
            />
          ))}
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button label="Back to Home" onPress={handleBackHome} />
        <Button label="Share Receipt" variant="secondary" onPress={handleShare} />
      </View>
    </ScrollView>
  );
}

function ReceiptRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.receiptRow, !last && styles.receiptRowBorder]}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + '20',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displaySm.fontSize,
    color: Colors.onSurface,
  },
  merchant: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    color: Colors.primary,
    marginTop: Spacing.md,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.lg,
  },
  pointsText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  receipt: {
    width: '100%',
    marginTop: Spacing.xxl,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    width: '100%',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
  },
  pendingText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  breakdownTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleSm.fontSize,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  receiptRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  receiptLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  receiptValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  actions: {
    width: '100%',
    marginTop: Spacing.xxl,
    gap: Spacing.md,
  },
});
