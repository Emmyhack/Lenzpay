import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CryptoLogo } from '@/components/ui/CryptoLogo';
import { useSourcesStore } from '@/store/sources';
import { showToast } from '@/components/ui/Toast';
import type { CurrencyCode } from '@/types/payment';

interface CoinField {
  code: 'BTC' | 'USDT' | 'ETH';
  label: string;
  placeholder: string;
}

const COINS: CoinField[] = [
  { code: 'BTC', label: 'Bitcoin', placeholder: 'bc1q...' },
  { code: 'USDT', label: 'USDT', placeholder: 'T... (TRC20)' },
  { code: 'ETH', label: 'Ethereum', placeholder: '0x...' },
];

export default function AddCryptoScreen() {
  const router = useRouter();
  const addSource = useSourcesStore((s) => s.addSource);
  const [permission, requestPermission] = useCameraPermissions();

  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [scanningFor, setScanningFor] = useState<CoinField['code'] | null>(null);
  const [binanceKey, setBinanceKey] = useState('');
  const [bybitKey, setBybitKey] = useState('');

  const handleAddressChange = (code: string, value: string) => {
    setAddresses((prev) => ({ ...prev, [code]: value }));
  };

  const openScanner = async (code: CoinField['code']) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showToast('error', 'Camera access needed', 'Enable camera permission to scan a wallet address.');
        return;
      }
    }
    setScanningFor(code);
  };

  const handleScanned = (result: BarcodeScanningResult) => {
    if (!scanningFor) return;
    handleAddressChange(scanningFor, result.data);
    setScanningFor(null);
  };

  const handleConnectWallet = (coin: CoinField) => {
    const address = addresses[coin.code];
    if (!address) return;

    addSource({
      id: `src_${coin.code.toLowerCase()}_${Date.now()}`,
      type: 'crypto',
      label: coin.label,
      accountMask: address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address,
      currency: 'NGN',
      balance: 0,
      rawBalance: 0,
      rawCurrency: coin.code as CurrencyCode,
      isDefault: false,
      lastSynced: new Date(),
    });
    showToast('success', `${coin.label} wallet added`);
    router.back();
  };

  const handleConnectExchange = (name: string, apiKey: string) => {
    if (!apiKey) return;
    addSource({
      id: `src_${name.toLowerCase()}_${Date.now()}`,
      type: 'crypto',
      label: name,
      accountMask: 'API',
      currency: 'NGN',
      balance: 0,
      rawBalance: 0,
      rawCurrency: 'USDT',
      isDefault: false,
      icon: 'key',
      iconColor: Colors.secondary,
      lastSynced: new Date(),
    });
    showToast('success', `${name} connected`);
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Add Crypto Wallet" />

      <View style={styles.list}>
        {COINS.map((coin) => (
          <View key={coin.code} style={styles.coinCard}>
            <View style={styles.coinHeader}>
              <CryptoLogo code={coin.code} size={26} />
              <Text style={styles.coinLabel}>{coin.label}</Text>
            </View>
            <View style={styles.addressRow}>
              <TextInput
                value={addresses[coin.code] ?? ''}
                onChangeText={(t) => handleAddressChange(coin.code, t)}
                placeholder={coin.placeholder}
                placeholderTextColor={Colors.onSurfaceMuted}
                style={styles.addressInput}
                autoCapitalize="none"
                accessibilityLabel={`${coin.label} address`}
              />
              <TouchableOpacity onPress={() => openScanner(coin.code)} style={styles.scanButton}>
                <Icon name="camera-outline" size={18} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <Button
              label="Connect"
              variant="secondary"
              onPress={() => handleConnectWallet(coin)}
              disabled={!addresses[coin.code]}
            />
          </View>
        ))}

        <Text style={styles.orLabel}>OR connect exchange</Text>

        <View style={styles.exchangeCard}>
          <Text style={styles.exchangeLabel}>Binance API Key</Text>
          <TextInput
            value={binanceKey}
            onChangeText={setBinanceKey}
            placeholder="Read-only API key"
            placeholderTextColor={Colors.onSurfaceMuted}
            style={styles.addressInput}
            secureTextEntry
          />
          <Button label="Connect Binance" variant="secondary" onPress={() => handleConnectExchange('Binance', binanceKey)} disabled={!binanceKey} />
        </View>

        <View style={styles.exchangeCard}>
          <Text style={styles.exchangeLabel}>Bybit API Key</Text>
          <TextInput
            value={bybitKey}
            onChangeText={setBybitKey}
            placeholder="Read-only API key"
            placeholderTextColor={Colors.onSurfaceMuted}
            style={styles.addressInput}
            secureTextEntry
          />
          <Button label="Connect Bybit" variant="secondary" onPress={() => handleConnectExchange('Bybit', bybitKey)} disabled={!bybitKey} />
        </View>

        <Text style={styles.disclosure}>0.5% spread applies on crypto → NGN conversion at payment time.</Text>
      </View>

      <Modal visible={scanningFor !== null} animationType="slide">
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScanned}
            />
          ) : null}
          <TouchableOpacity onPress={() => setScanningFor(null)} style={styles.cameraCancel}>
            <Text style={styles.cameraCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  coinCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  coinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  coinLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  addressRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addressInput: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  scanButton: {
    width: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginVertical: Spacing.lg,
  },
  exchangeCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  exchangeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  disclosure: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraCancel: {
    position: 'absolute',
    bottom: Spacing.xxl,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  cameraCancelText: {
    fontFamily: 'Inter_500Medium',
    color: '#fff',
    fontSize: 14,
  },
});
