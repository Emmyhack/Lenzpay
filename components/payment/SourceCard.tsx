import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CryptoLogo, hasCryptoLogo } from '@/components/ui/CryptoLogo';
import { BankLogo } from '@/components/ui/BankLogo';
import type { PaymentSource, SourceStatus } from '@/types/payment';

interface SourceCardProps {
  source: PaymentSource;
  status: SourceStatus;
  splitAmount?: number; // for split mode
  onPress?: () => void;
}

// Status → tag config
const STATUS_CONFIG: Record<SourceStatus, { label: string; icon: IconName; color: string; showBorder: boolean }> = {
  auto: { label: 'AUTO', icon: 'flash', color: Colors.primary, showBorder: true },
  split: { label: 'SPLIT', icon: 'shuffle', color: Colors.warning, showBorder: true },
  selected: { label: 'SELECTED', icon: 'checkmark-circle', color: Colors.success, showBorder: true },
  insufficient: { label: 'LOW', icon: 'close-circle', color: Colors.error, showBorder: false },
  active: { label: 'OK', icon: 'checkmark-circle', color: Colors.success, showBorder: false },
  default: { label: 'OK', icon: 'checkmark-circle', color: Colors.success, showBorder: false },
  error: { label: 'ERROR', icon: 'alert-circle', color: Colors.error, showBorder: true },
};

export function SourceCard({ source, status, splitAmount, onPress }: SourceCardProps) {
  const cfg = STATUS_CONFIG[status];
  const isInsufficient = status === 'insufficient';
  const isInteractive = !isInsufficient && !!onPress;

  const formatBalance = () => {
    if (source.rawCurrency === 'NGN') return `₦${source.rawBalance.toLocaleString()}`;
    if (source.rawCurrency === 'BTC')
      return `${source.rawBalance} BTC → ₦${Math.round(source.balance).toLocaleString()}`;
    if (source.rawCurrency === 'USDT')
      return `$${source.rawBalance} → ₦${Math.round(source.balance).toLocaleString()}`;
    return `$${source.rawBalance} → ₦${Math.round(source.balance).toLocaleString()}`;
  };

  const borderColor = cfg.showBorder ? cfg.color : Colors.outlineVariant;

  return (
    <TouchableOpacity
      onPress={isInteractive ? onPress : undefined}
      activeOpacity={isInsufficient ? 1 : 0.85}
      style={[
        styles.card,
        { borderColor, backgroundColor: Colors.surfaceContainerHigh },
        isInsufficient && styles.insufficient,
        cfg.showBorder && {
          shadowColor: cfg.color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 6,
        },
      ]}
      accessibilityRole={isInteractive ? 'button' : undefined}
      accessibilityState={{ disabled: isInsufficient, selected: status === 'selected' }}
    >
      {source.icon ? (
        <View style={[styles.iconWrap, { backgroundColor: source.iconColor + '20' }]}>
          <Icon name={source.icon} size={16} color={source.iconColor} />
        </View>
      ) : hasCryptoLogo(source.rawCurrency) ? (
        <CryptoLogo code={source.rawCurrency} size={32} />
      ) : source.bankCode ? (
        <BankLogo code={source.bankCode} name={source.label} size={32} />
      ) : (
        <Text style={styles.flag}>{source.flag}</Text>
      )}
      <View style={styles.info}>
        <Text style={styles.label}>
          {source.label} {source.accountMask}
        </Text>
        <Text style={styles.balance}>
          {status === 'split' && splitAmount
            ? `Paying ₦${splitAmount.toLocaleString()}`
            : formatBalance()}
        </Text>
      </View>
      <View style={[styles.tag, { backgroundColor: cfg.color + '20' }]}>
        <Icon name={cfg.icon} size={11} color={cfg.color} />
        <Text style={[styles.tagText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  insufficient: { opacity: 0.4 },
  flag: { fontSize: 24 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
  },
  balance: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
