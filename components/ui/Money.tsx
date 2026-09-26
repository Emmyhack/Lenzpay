import React from 'react';
import { Text, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import { Colors } from '@/constants/theme';
import type { CurrencyCode } from '@/types/payment';

/**
 * A currency amount set for display.
 *
 * Space Grotesk draws ₦ (U+20A6) with crossbars almost as heavy as its
 * counters, and at Bold display weight the glyph both fills in and kerns
 * straight into the following digit — "₦10" renders with the symbol and the 1
 * touching. The glyph is present in the font; it is simply not usable at this
 * weight and size. Inter's ₦ at the same size is clean.
 *
 * So the symbol is set in Inter, slightly smaller than the digits and followed
 * by a thin space, while the digits stay in Space Grotesk. Mixing a face for
 * the currency mark is ordinary typographic practice, and it is the smallest
 * change that fixes every large amount in the app at once.
 *
 * Only worth using at display sizes. In body copy Inter already sets both the
 * symbol and the number, and there is nothing to correct.
 */

const SYMBOL_SCALE = 0.72;
/** U+2009. Narrower than a word space — a gap, not a separation. */
const THIN_SPACE = ' ';

const SYMBOL: Partial<Record<CurrencyCode, string>> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

export interface MoneyProps {
  /** Amount in major units. */
  value: number;
  currency?: CurrencyCode;
  /** Font size of the digits; the symbol is scaled from this. */
  size: number;
  color?: string;
  /** Space Grotesk weight for the digits. */
  weight?: '500Medium' | '700Bold';
  /** Prefix shown before the symbol, e.g. a debit/credit sign. */
  sign?: string;
  maximumFractionDigits?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function Money({
  value,
  currency = 'NGN',
  size,
  color = Colors.onSurface,
  weight = '700Bold',
  sign,
  maximumFractionDigits = 0,
  style,
  numberOfLines,
}: MoneyProps) {
  const symbol = SYMBOL[currency] ?? '';
  const digits = value.toLocaleString(undefined, { maximumFractionDigits });

  return (
    <Text
      style={[
        styles.base,
        { fontSize: size, color, fontFamily: `SpaceGrotesk_${weight}` },
        style,
      ]}
      numberOfLines={numberOfLines}
      // The visual is two faces; screen readers should hear one amount.
      accessibilityLabel={`${sign ?? ''}${symbol}${digits}`}
    >
      {sign}
      <Text style={[styles.symbol, { fontSize: Math.round(size * SYMBOL_SCALE) }]}>
        {symbol}
      </Text>
      {THIN_SPACE}
      {digits}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    // Tightened tracking is what makes the collision visible in the first
    // place, so it is not applied here; per-call-site style can still set it.
    includeFontPadding: false,
  },
  symbol: {
    fontFamily: 'Inter_600SemiBold',
  },
});
