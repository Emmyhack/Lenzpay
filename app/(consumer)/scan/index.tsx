import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { QRViewport } from '@/components/scan/QRViewport';
import { Button } from '@/components/ui/Button';
import { usePaymentStore } from '@/store/payment';
import { MOCK_MERCHANT } from '@/mock/data';
import type { Merchant } from '@/types/payment';

const RECENT_MERCHANTS: Merchant[] = [
  MOCK_MERCHANT,
  {
    id: 'mkt_coffee_001',
    name: 'Coffee & Co.',
    category: 'food',
    isVerified: true,
    location: 'Lagos, NG',
    acceptedCurrencies: ['NGN', 'USD'],
    icon: '☕',
  },
];

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const setMerchant = usePaymentStore((s) => s.setMerchant);
  const [torchOn, setTorchOn] = useState(false);
  const hasScanned = useRef(false);

  const goToMerchant = useCallback(
    (merchant: Merchant) => {
      setMerchant(merchant);
      router.push('/(consumer)/scan/merchant');
    },
    [setMerchant, router]
  );

  const handleBarcodeScanned = useCallback(
    (_result: BarcodeScanningResult) => {
      if (hasScanned.current) return;
      hasScanned.current = true;
      // Real merchant resolution would look up _result.data against the
      // merchant directory; mock mode just routes to the demo merchant.
      goToMerchant(MOCK_MERCHANT);
      setTimeout(() => {
        hasScanned.current = false;
      }, 2000);
    },
    [goToMerchant]
  );

  if (!permission) {
    return <View style={styles.wrap} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.wrap, styles.permissionWrap]}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>Lenz Pay needs your camera to scan merchant QR codes.</Text>
        <Button label="Enable Camera" onPress={requestPermission} style={styles.permissionButton} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <QRViewport onScanned={handleBarcodeScanned} torchOn={torchOn} />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.iconGlyph}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan to Pay</Text>
        <TouchableOpacity
          onPress={() => setTorchOn((v) => !v)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Toggle flashlight"
        >
          <Text style={styles.iconGlyph}>{torchOn ? '🔦' : '💡'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomOverlay}>
        <TouchableOpacity
          onPress={() => router.push('/(consumer)/scan/amount')}
          style={styles.manualButton}
          accessibilityRole="button"
        >
          <Text style={styles.manualButtonText}>✏ Enter manually</Text>
        </TouchableOpacity>

        <Text style={styles.recentLabel}>Recent Merchants</Text>
        {RECENT_MERCHANTS.map((merchant) => (
          <View key={merchant.id} style={styles.recentRow}>
            <Text style={styles.recentIcon}>{merchant.icon}</Text>
            <Text style={styles.recentName} numberOfLines={1}>
              {merchant.name}
            </Text>
            <TouchableOpacity onPress={() => goToMerchant(merchant)} style={styles.payPill}>
              <Text style={styles.payPillText}>Pay</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  permissionIcon: { fontSize: 40, marginBottom: Spacing.md },
  permissionTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  permissionBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  permissionButton: {
    width: '100%',
  },
  topBar: {
    position: 'absolute',
    top: Spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 18, color: '#fff' },
  topTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(14,14,15,0.85)',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  manualButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  manualButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  recentLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  recentIcon: { fontSize: 18 },
  recentName: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.onSurface,
  },
  payPill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  payPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.onPrimary,
  },
});
