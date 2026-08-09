import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

export interface CategoryBreakdown {
  key: string;
  label: string;
  icon: IconName;
  amountNGN: number;
}

interface CategoryGridProps {
  categories: CategoryBreakdown[];
}

function CategoryCard({ category, ratio }: { category: CategoryBreakdown; ratio: number }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(ratio * 100, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [ratio, width]);

  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Icon name={category.icon} size={16} color={Colors.secondary} />
      </View>
      <Text style={styles.label}>{category.label}</Text>
      <Text style={styles.amount}>₦{category.amountNGN.toLocaleString()}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle]} />
      </View>
    </View>
  );
}

export function CategoryGrid({ categories }: CategoryGridProps) {
  const max = Math.max(...categories.map((c) => c.amountNGN), 1);

  return (
    <View style={styles.grid}>
      {categories.map((category) => (
        <CategoryCard key={category.key} category={category} ratio={category.amountNGN / max} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  card: {
    width: '47%',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.secondary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleSm.fontSize,
    color: Colors.onSurface,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.secondary,
  },
});
