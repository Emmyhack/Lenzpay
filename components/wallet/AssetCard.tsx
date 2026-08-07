import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Spacing, Gradients } from '@/constants/theme';
import { Badge, BadgeKind } from '@/components/ui/Badge';
import type { PaymentSource } from '@/types/payment';

interface AssetCardProps {
  source: PaymentSource;
  onPress?: () => void;
}

function badgeKindFor(source: PaymentSource): BadgeKind {
  if (source.rawCurrency === 'NGN') return 'NGN';
  return source.rawCurrency as BadgeKind;
}

export function AssetCard({ source, onPress }: AssetCardProps) {
  const isCrypto = source.type === 'crypto';
  const balanceLabel =
    source.rawCurrency === 'NGN'
      ? `₦${source.rawBalance.toLocaleString()}`
      : `${source.rawCurrency === 'BTC' ? source.rawBalance : `$${source.rawBalance.toLocaleString()}`} ${
          source.rawCurrency === 'BTC' ? 'BTC' : ''
        }`.trim();

  const content = (
    <>
      <View style={styles.topRow}>
        <Text style={styles.flag}>{source.flag}</Text>
        {source.isDefault ? <Badge kind="DEFAULT" /> : <Badge kind={badgeKindFor(source)} />}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {source.label}
      </Text>
      <Text style={styles.mask}>{source.accountMask}</Text>
      <Text style={styles.balance} numberOfLines={1}>
        {balanceLabel}
      </Text>
      <Text style={styles.ngnEquivalent}>≈ ₦{Math.round(source.balance).toLocaleString()}</Text>
    </>
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.touchable}>
      {isCrypto ? (
        <LinearGradient
          colors={Gradients.cryptoCard.colors}
          start={Gradients.cryptoCard.start}
          end={Gradients.cryptoCard.end}
          style={styles.card}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.card, { backgroundColor: Colors.surfaceContainerLow }]}>{content}</View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    marginRight: Spacing.md,
  },
  card: {
    width: 168,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flag: { fontSize: 22 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
    marginTop: Spacing.md,
  },
  mask: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: 2,
  },
  balance: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: Colors.onSurface,
    marginTop: Spacing.sm,
  },
  ngnEquivalent: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});
