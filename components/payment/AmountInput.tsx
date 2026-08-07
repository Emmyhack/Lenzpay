import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

interface AmountInputProps {
  value: string; // raw digit string, e.g. "2500"
  onChangeValue: (value: string) => void;
  currencyCode?: string;
  equivalents?: string; // "≈ $X.XX · ≈ 0.000000 BTC"
}

export function AmountInput({ value, onChangeValue, currencyCode = 'NGN', equivalents }: AmountInputProps) {
  const displayValue = value ? Number(value).toLocaleString() : '0';

  const handleChangeText = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    onChangeValue(digitsOnly);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>₦ {currencyCode}</Text>
      </View>
      <View style={styles.fieldWrap}>
        <Text style={styles.currencySymbol}>₦</Text>
        <TextInput
          value={displayValue === '0' ? '' : displayValue}
          onChangeText={handleChangeText}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={Colors.onSurfaceMuted}
          style={styles.field}
          accessibilityLabel="Payment amount"
        />
      </View>
      {equivalents ? <Text style={styles.equivalents}>{equivalents}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  pill: {
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    color: Colors.onSurfaceVariant,
    marginRight: Spacing.xs,
  },
  field: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    color: Colors.onSurface,
    minWidth: 80,
    textAlign: 'center',
  },
  equivalents: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.sm,
  },
});
