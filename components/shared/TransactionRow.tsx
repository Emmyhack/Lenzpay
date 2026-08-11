import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { CATEGORY_ICON } from '@/mock/data';
import type { Transaction } from '@/types/payment';

interface TransactionRowProps {
  transaction: Transaction;
  onPress?: () => void;
  /** Append the time of day to the meta line — useful in date-grouped lists. */
  showTime?: boolean;
  /** Hairline above the row, for rows grouped inside a card. */
  divided?: boolean;
}

export function TransactionRow({
  transaction,
  onPress,
  showTime = false,
  divided = false,
}: TransactionRowProps) {
  const isCredit = transaction.direction === 'credit';
  const amountColor = isCredit ? Colors.success : Colors.onSurface;
  const amountPrefix = isCredit ? '+' : '-';

  const time = showTime
    ? transaction.timestamp.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const meta = time ? `${transaction.sourceLabel} · ${time}` : transaction.sourceLabel;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, divided && styles.divided]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${transaction.merchantName}, ${amountPrefix}₦${transaction.amount.toLocaleString()}` : undefined}
    >
      <View style={styles.iconWrap}>
        <Icon name={CATEGORY_ICON[transaction.category] ?? CATEGORY_ICON.other} size={18} color={Colors.onSurfaceVariant} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {transaction.merchantName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {amountPrefix}₦{transaction.amount.toLocaleString()}
        </Text>
        {transaction.pointsEarned > 0 ? (
          <Text style={styles.points}>+{transaction.pointsEarned} pts</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  divided: {
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  right: { alignItems: 'flex-end' },
  amount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
  },
  points: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.primary,
    marginTop: 2,
  },
});
