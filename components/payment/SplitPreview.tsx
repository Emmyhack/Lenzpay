import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { SourceCard } from './SourceCard';
import type { SplitAllocation } from '@/types/payment';

interface SplitPreviewProps {
  amountNGN: number;
  allocations: SplitAllocation[];
}

export function SplitPreview({ amountNGN, allocations }: SplitPreviewProps) {
  const total = allocations.reduce((sum, a) => sum + a.amount, 0);

  return (
    <View>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Smart Split</Text>
        <Text style={styles.noticeBody}>
          No single account covers ₦{amountNGN.toLocaleString()} — splitting across {allocations.length} sources.
        </Text>
      </View>

      {allocations.map((allocation) => (
        <SourceCard
          key={allocation.source.id}
          source={allocation.source}
          status="split"
          splitAmount={allocation.amount}
        />
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <View style={styles.totalValueRow}>
          <Text style={[styles.totalValue, total === amountNGN && styles.totalMatch]}>
            ₦{total.toLocaleString()}
          </Text>
          {total === amountNGN ? <Icon name="checkmark-circle" size={16} color={Colors.success} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: Colors.warning + '18',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  noticeTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleSm.fontSize,
    color: Colors.warning,
  },
  noticeBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  totalLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
  },
  totalValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  totalValue: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  totalMatch: {
    color: Colors.success,
  },
});
