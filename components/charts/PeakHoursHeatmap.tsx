import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface PeakHoursHeatmapProps {
  hourlyCounts: number[]; // 24 entries, index = hour of day
}

function hourLabel(hour: number) {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

export function PeakHoursHeatmap({ hourlyCounts }: PeakHoursHeatmapProps) {
  const max = Math.max(...hourlyCounts, 1);

  return (
    <View>
      <View style={styles.grid}>
        {hourlyCounts.map((count, hour) => {
          const intensity = count / max;
          return (
            <View
              key={hour}
              style={[
                styles.cell,
                { backgroundColor: intensity === 0 ? Colors.surfaceContainerHigh : Colors.primary, opacity: intensity === 0 ? 1 : 0.25 + intensity * 0.75 },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.labelRow}>
        {[0, 6, 12, 18, 23].map((hour) => (
          <Text key={hour} style={styles.label}>
            {hourLabel(hour)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const CELL_GAP = 3;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  cell: {
    flex: 1,
    aspectRatio: 0.6,
    borderRadius: Radius.sm / 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.onSurfaceMuted,
  },
});
