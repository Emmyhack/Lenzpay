import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { QRViewport } from '@/components/scan/QRViewport';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { showToast } from '@/components/ui/Toast';
import { usePaymentStore } from '@/store/payment';
import { buildPaymentQR, resolvePayee } from '@/services/payee';
import { mockPayeeDirectory } from '@/mock/payees';
import { CATEGORY_ICON } from '@/mock/data';

/**
 * Recents are resolved through the same path a camera scan takes, rather than
 * shortcutting straight into the store. That keeps one code path to reason
 * about — and it is the only way to exercise scanning on a simulator, which
 * has no camera.
 */
const RECENT_PAYEES: { id: string; name: string; category: string }[] = [
  { id: 'mkt_bolt_001', name: 'Bolt Driver — Emeka', category: 'transport' },
  { id: 'mkt_coffee_001', name: 'Coffee & Co.', category: 'food' },
  { id: 'mch_001', name: 'Emeka’s Kitchen', category: 'food' },
];

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const setPayee = usePaymentStore((s) => s.setPayee);
  const [torchOn, setTorchOn] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const hasScanned = useRef(false);

  // The scan screen stays mounted underneath the rest of the payment flow, so
  // without this the camera keeps running — and keeps firing scans — while the
  // user is on the amount, source, or confirm screens.
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      hasScanned.current = false;
      return () => {
        setIsFocused(false);
        setTorchOn(false);
      };
    }, [])
  );

  /** Shared by the camera and the recents list — one resolution path. */
  const acceptPayload = useCallback(
    async (payload: string) => {
      const resolution = await resolvePayee({ type: 'qr', value: payload }, mockPayeeDirectory);

      if (!resolution.ok) {
        showToast('error', "Couldn't read this code", resolution.reason);
        return false;
      }

      const { payee, fixedAmount } = resolution;
      setPayee(payee, fixedAmount);

      // A merchant-pinned amount skips the amount step entirely — the price is
      // the merchant's to set, not the payer's.
      router.push(fixedAmount ? '/(consumer)/scan/source' : '/(consumer)/scan/amount');
      return true;
    },
    [setPayee, router]
  );

  const handleBarcodeScanned = useCallback(
    async (result: BarcodeScanningResult) => {
      if (hasScanned.current) return;
      hasScanned.current = true;

      // §3.3 — a code that doesn't decode, or resolves to a payee with no
      // verifiable settlement destination, must not become a payment.
      await acceptPayload(result.data);

      // Re-arm either way: a rejected code should be re-scannable, and a
      // successful one should work again if the user comes back.
      setTimeout(() => {
        hasScanned.current = false;
      }, 2000);
    },
    [acceptPayload]
  );

  if (!permission) {
    return <View style={styles.wrap} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.wrap, styles.permissionWrap]}>
        <View style={styles.permissionIconWrap}>
          <Icon name="camera-outline" size={32} color={Colors.onSurface} />
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>Lenz Pay needs your camera to scan merchant QR codes.</Text>
        <Button label="Enable Camera" onPress={requestPermission} style={styles.permissionButton} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <QRViewport onScanned={handleBarcodeScanned} active={isFocused} torchOn={torchOn} />

      <View style={[styles.topBar, { top: insets.top + Spacing.lg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan to Pay</Text>
        <TouchableOpacity
          onPress={() => setTorchOn((v) => !v)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Toggle flashlight"
        >
          <Icon name={torchOn ? 'flash' : 'flash-off'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomOverlay}>
        <TouchableOpacity
          onPress={() => router.push('/(consumer)/scan/payee')}
          style={styles.manualButton}
          accessibilityRole="button"
        >
          <Icon name="create-outline" size={16} color={Colors.onSurfaceVariant} />
          <Text style={styles.manualButtonText}>Enter manually</Text>
        </TouchableOpacity>

        <Text style={styles.recentLabel}>Recent Merchants</Text>
        {RECENT_PAYEES.map((recent) => (
          <View key={recent.id} style={styles.recentRow}>
            <View style={styles.recentIconWrap}>
              <Icon name={CATEGORY_ICON[recent.category] ?? CATEGORY_ICON.other} size={14} color={Colors.onSurface} />
            </View>
            <Text style={styles.recentName} numberOfLines={1}>
              {recent.name}
            </Text>
            <TouchableOpacity
              onPress={() => acceptPayload(buildPaymentQR({ payeeId: recent.id }))}
              style={styles.payPill}
            >
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
  permissionIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
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
    flexDirection: 'row',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
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
  recentIconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
