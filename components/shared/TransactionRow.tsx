import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import type { Transaction } from '@/types/payment';

interface TransactionRowProps {
  transaction: Transaction;
  onPress?: () => void;
}

export function TransactionRow({ transaction, onPress }: TransactionRowProps) {
  const isCredit = transaction.direction === 'credit';
  const amountColor = isCredit ? Colors.success : Colors.onSurface;
  const amountPrefix = isCredit ? '+' : '-';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.row}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{transaction.merchantIcon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {transaction.merchantName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {transaction.sourceLabel}
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
  icon: { fontSize: 20 },
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
