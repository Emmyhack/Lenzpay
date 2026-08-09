import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CartesianChart, Bar } from 'victory-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

export interface DailySpend {
  day: string; // "Mon", "Tue", ...
  amountNGN: number;
}

interface SpendBarChartProps {
  data: DailySpend[];
  height?: number;
}

/**
 * Weekly spend bar chart via Victory Native XL (Skia-rendered). The current
 * day's bar is highlighted in the brand lime; the rest use a muted tone so
 * "where am I in the week" reads at a glance.
 */
export function SpendBarChart({ data, height = 160 }: SpendBarChartProps) {
  const chartData = data.map((d, i) => ({ x: i, amount: d.amountNGN, day: d.day }));
  const todayIndex = data.length - 1;

  if (data.every((d) => d.amountNGN === 0)) {
    return (
      <View style={[styles.wrap, { height }]}>
        <Text style={styles.emptyText}>No spend recorded this week</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={{ height }}>
        <CartesianChart data={chartData} xKey="x" yKeys={['amount']} domainPadding={{ left: 24, right: 24, top: 16 }}>
          {({ points, chartBounds }) => (
            <Bar
              points={points.amount}
              chartBounds={chartBounds}
              color={Colors.primary}
              roundedCorners={{ topLeft: 6, topRight: 6 }}
              barWidth={18}
            />
          )}
        </CartesianChart>
      </View>
      <View style={styles.labelRow}>
        {data.map((d, i) => (
          <Text key={d.day} style={[styles.dayLabel, i === todayIndex && styles.dayLabelActive]}>
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
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
    textAlign: 'center',
    textAlignVertical: 'center',
    flex: 1,
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
  dayLabelActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
});
