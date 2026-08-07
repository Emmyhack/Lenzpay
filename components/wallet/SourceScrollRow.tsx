import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { AssetCard } from './AssetCard';
import type { PaymentSource } from '@/types/payment';

interface SourceScrollRowProps {
  sources: PaymentSource[];
  onPressSource?: (source: PaymentSource) => void;
}

export function SourceScrollRow({ sources, onPressSource }: SourceScrollRowProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {sources.map((source) => (
        <AssetCard key={source.id} source={source} onPress={() => onPressSource?.(source)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.xl,
  },
});
