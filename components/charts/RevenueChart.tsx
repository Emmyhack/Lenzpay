import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { Colors, Spacing } from '@/constants/theme';
import type { DailySpend } from './SpendBarChart';

interface RevenueChartProps {
  data: DailySpend[];
  height?: number;
}

/**
 * Merchant revenue trend — a line chart (vs. the consumer SpendBarChart's
 * bars) so the two contexts read as visually distinct at a glance.
 */
export function RevenueChart({ data, height = 180 }: RevenueChartProps) {
  const chartData = data.map((d, i) => ({ x: i, amount: d.amountNGN }));

  return (
    <View style={styles.wrap}>
      <View style={{ height }}>
        <CartesianChart data={chartData} xKey="x" yKeys={['amount']} domainPadding={{ left: 16, right: 16, top: 24, bottom: 8 }}>
          {({ points }) => <Line points={points.amount} color={Colors.primary} strokeWidth={3} curveType="natural" />}
        </CartesianChart>
      </View>
      <View style={styles.labelRow}>
        {data.map((d) => (
          <Text key={d.day} style={styles.dayLabel}>
            {d.day}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.sm,
  },
  dayLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
  },
});
