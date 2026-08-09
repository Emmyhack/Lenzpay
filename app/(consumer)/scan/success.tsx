import { useEffect } from 'react';
import { View, Text, Share, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
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
import { usePaymentStore } from '@/store/payment';

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function SuccessScreen() {
  const router = useRouter();
  const transaction = usePaymentStore((s) => s.lastTransaction);
  const reset = usePaymentStore((s) => s.reset);

  const ringScale = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);

  useEffect(() => {
    ringScale.value = withSpring(1, { damping: 6, stiffness: 180 });
    badgeOpacity.value = withDelay(300, withTiming(1, { duration: 300 }));
  }, [ringScale, badgeOpacity]);

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
    router.replace('/(consumer)');
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, ringStyle]}>
        <Text style={styles.check}>✓</Text>
      </Animated.View>

      <Text style={styles.title}>Payment Sent!</Text>
      <Text style={styles.merchant}>{transaction.merchantName}</Text>
      <Text style={styles.amount}>₦{transaction.amount.toLocaleString()}</Text>

      <Animated.View style={[styles.pointsBadge, badgeStyle]}>
        <Text style={styles.pointsText}>⭐ +{transaction.pointsEarned} pts earned</Text>
      </Animated.View>

      <Card variant="containerHigh" style={styles.receipt}>
        <ReceiptRow label="Source" value={transaction.sourceLabel} />
        <ReceiptRow label="Mode" value={transaction.mode === 'split' ? 'Smart Split' : transaction.mode === 'auto' ? 'Auto' : 'Manual'} />
        {transaction.fxRate ? <ReceiptRow label="FX Rate" value={transaction.fxRate} /> : null}
        <ReceiptRow label="Cashback" value={`₦${transaction.cashbackNGN.toLocaleString()}`} />
        <ReceiptRow label="Fee" value="₦0" />
        <ReceiptRow label="Time" value={formatTime(transaction.timestamp)} last />
      </Card>

      <View style={styles.actions}>
        <Button label="Back to Home" onPress={handleBackHome} />
        <Button label="Share Receipt" variant="secondary" onPress={handleShare} />
      </View>
    </View>
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
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
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
  check: {
    fontSize: 36,
    color: Colors.primary,
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
    paddingBottom: Spacing.xxl,
  },
});
