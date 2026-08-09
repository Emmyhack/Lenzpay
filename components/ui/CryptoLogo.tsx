import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';

// Official coin marks (CC0-licensed, github.com/atomiclabs/cryptocurrency-icons)
// bundled locally so they render pixel-exact and work offline — unlike bank
// logos, these three are small, unambiguous, and safe to ship in the app.
const LOGOS: Record<string, number> = {
  BTC: require('@/assets/images/crypto/btc.png'),
  ETH: require('@/assets/images/crypto/eth.png'),
  USDT: require('@/assets/images/crypto/usdt.png'),
};

interface CryptoLogoProps {
  code: string;
  size?: number;
}

/** The exact coin/token logo when we have one bundled; falls back to a
 * generic coin glyph for any asset outside that set. */
export function CryptoLogo({ code, size = 24 }: CryptoLogoProps) {
  const source = LOGOS[code.toUpperCase()];

  if (source) {
    return (
      <Image
        source={source}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="contain"
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon name="logo-bitcoin" size={size * 0.6} color={Colors.onSurfaceVariant} />
    </View>
  );
}

export function hasCryptoLogo(code: string): boolean {
  return code.toUpperCase() in LOGOS;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
