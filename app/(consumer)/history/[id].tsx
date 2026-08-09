import { useEffect, useState } from 'react';
import { View, Text, Share, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { fetchTransactionById } from '@/services/payments';
import { showToast } from '@/components/ui/Toast';
import { CATEGORY_ICON } from '@/mock/data';
import type { Transaction } from '@/types/payment';

function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(undefined);

  useEffect(() => {
    fetchTransactionById(id).then((t) => setTransaction(t ?? null));
  }, [id]);

  if (transaction === undefined) return <View style={styles.wrap} />;

  if (!transaction) {
    return (
      <View style={styles.wrap}>
        <ScreenHeader title="Transaction" />
        <EmptyState icon="receipt-outline" title="Transaction not found" />
      </View>
    );
  }

  const isCredit = transaction.direction === 'credit';

  const handleCopyRef = async () => {
    await Clipboard.setStringAsync(transaction.txnRef);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('success', 'Copied', transaction.txnRef);
  };

  const handleShare = () => {
    Share.share({
      message: `LenzPay receipt\n₦${transaction.amount.toLocaleString()} · ${transaction.merchantName}\nRef: ${transaction.txnRef}\n${formatDateTime(transaction.timestamp)}`,
    });
  };

  const handleDispute = () => {
    router.push('/(consumer)/profile/support');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Transaction" />

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Icon name={CATEGORY_ICON[transaction.category] ?? CATEGORY_ICON.other} size={28} color={Colors.onSurface} />
        </View>

        <Text style={[styles.amount, { color: isCredit ? Colors.success : Colors.onSurface }]}>
          {isCredit ? '+' : '-'}₦{transaction.amount.toLocaleString()}
        </Text>
        <Text style={styles.datetime}>{formatDateTime(transaction.timestamp)}</Text>

        <Card variant="containerHigh" style={styles.receipt}>
          <ReceiptRow label="Merchant" value={transaction.merchantName} />
          <ReceiptRow label="Source" value={transaction.sourceLabel} />
          <ReceiptRow label="Mode" value={transaction.mode === 'split' ? 'Smart Split' : transaction.mode === 'auto' ? 'Auto' : 'Manual'} />
          {transaction.fxRate ? <ReceiptRow label="FX Rate" value={transaction.fxRate} /> : null}
          <ReceiptRow label="Cashback" value={`₦${transaction.cashbackNGN.toLocaleString()}`} />
          <ReceiptRow label="Status" value={transaction.status} />
          <TouchableOpacity onPress={handleCopyRef} style={[styles.receiptRow, styles.receiptRowLast]}>
            <Text style={styles.receiptLabel}>Txn ID</Text>
            <Text style={styles.receiptValueMono}>{transaction.txnRef}</Text>
          </TouchableOpacity>
        </Card>

        <View style={styles.actions}>
          <Button label="Share Receipt" onPress={handleShare} />
          <Button label="Dispute Transaction" variant="tertiary" onPress={handleDispute} />
        </View>
      </View>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
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
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    marginTop: Spacing.lg,
  },
  datetime: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.xs,
  },
  receipt: {
    width: '100%',
    marginTop: Spacing.xxl,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  receiptRowLast: {
    borderBottomWidth: 0,
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
  receiptValueMono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    color: Colors.primary,
  },
  actions: {
    width: '100%',
    marginTop: Spacing.xxl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
});
