import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { BankLogo } from '@/components/ui/BankLogo';
import { useSourcesStore } from '@/store/sources';
import { showToast } from '@/components/ui/Toast';

interface WalletProvider {
  key: string;
  name: string;
  bankCode: string; // matches mock/banks.ts NIGERIAN_BANKS
}

const WALLET_PROVIDERS: WalletProvider[] = [
  { key: 'opay', name: 'OPay', bankCode: '999992' },
  { key: 'kuda', name: 'Kuda', bankCode: '50211' },
  { key: 'palmpay', name: 'PalmPay', bankCode: '999991' },
  { key: 'moniepoint', name: 'Moniepoint', bankCode: '50515' },
];

export default function AddWalletScreen() {
  const router = useRouter();
  const addSource = useSourcesStore((s) => s.addSource);
  const [connectingKey, setConnectingKey] = useState<string | null>(null);

  const handleConnect = async (provider: WalletProvider) => {
    setConnectingKey(provider.key);
    try {
      // Real OAuth would open the provider's authorize URL; the mock demo
      // page below stands in for it so the browser hand-off is exercised.
      await WebBrowser.openAuthSessionAsync('https://example.com/oauth/mock', 'lenzpay://sources/wallet');
    } finally {
      setConnectingKey(null);
    }

    addSource({
      id: `src_${provider.key}_${Date.now()}`,
      type: 'wallet',
      label: provider.name,
      accountMask: `*${Math.floor(1000 + Math.random() * 9000)}`,
      currency: 'NGN',
      balance: 0,
      rawBalance: 0,
      rawCurrency: 'NGN',
      isDefault: false,
      bankCode: provider.bankCode,
      flag: '🇳🇬',
      lastSynced: new Date(),
    });
    showToast('success', `${provider.name} connected`);
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Add Mobile Wallet" subtitle="Connect via secure OAuth" />

      <View style={styles.grid}>
        {WALLET_PROVIDERS.map((provider) => (
          <TouchableOpacity
            key={provider.key}
            onPress={() => handleConnect(provider)}
            style={styles.card}
            disabled={connectingKey !== null}
            activeOpacity={0.8}
          >
            {connectingKey === provider.key ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <BankLogo code={provider.bankCode} name={provider.name} size={48} />
                <Text style={styles.cardName}>{provider.name}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  card: {
    width: '47%',
    aspectRatio: 1.3,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  cardName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
});
