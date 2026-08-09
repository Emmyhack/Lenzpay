import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import { BANK_LOGO_DOMAIN } from '@/constants/bankLogos';

interface BankLogoProps {
  /** NIBSS bank code, e.g. mock/banks.ts codes. */
  code?: string;
  /** Bank/wallet name, used for the initials fallback and accessibility. */
  name: string;
  size?: number;
}

function initialsFor(name: string) {
  return name
    .replace(/\(.*\)/g, '') // drop parenthetical suffixes like "(Diamond)"
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/**
 * Fetches a bank/wallet's real logo live from their own site (via a
 * favicon lookup) for the institutions we've verified return their actual
 * mark — see constants/bankLogos.ts. Everything else, and any logo that
 * fails to load, falls back to a tinted initials badge rather than show a
 * wrong or broken image.
 */
export function BankLogo({ code, name, size = 40 }: BankLogoProps) {
  const [failed, setFailed] = useState(false);
  const domain = code ? BANK_LOGO_DOMAIN[code] : undefined;

  if (!domain || failed) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initialsFor(name)}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
      accessibilityLabel={`${name} logo`}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  initials: {
    fontFamily: 'Inter_600SemiBold',
    color: Colors.onSurfaceVariant,
  },
});
