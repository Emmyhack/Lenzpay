import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { QRViewport, type ScanStatus } from '@/components/scan/QRViewport';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { BankLogo } from '@/components/ui/BankLogo';
import { usePaymentStore } from '@/store/payment';
import { buildPaymentQR, resolvePayee } from '@/services/payee';
import { mockPayeeDirectory } from '@/mock/payees';

/**
 * Recents resolve through the same path a camera scan takes, rather than
 * shortcutting into the store. One code path to reason about — and it is the
 * only way to exercise scanning on a simulator, which has no camera.
 */
const RECENT_PAYEES: { id: string; name: string; bankCode?: string }[] = [
  { id: 'mkt_bolt_001', name: 'Bolt · Emeka', bankCode: '044' },
  { id: 'mkt_coffee_001', name: 'Coffee & Co.', bankCode: '058' },
  { id: 'mch_001', name: 'Emeka’s Kitchen', bankCode: '058' },
];

const IDLE_HINT = 'Point at a Lenz or NQR payment code';
/** How long a rejected code's message stays before the scanner re-arms. */
const ERROR_HOLD_MS = 2400;

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const setPayee = usePaymentStore((s) => s.setPayee);

  const [torchOn, setTorchOn] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [hint, setHint] = useState(IDLE_HINT);
  // Measured rather than assumed: the sheet grows with its content, and the
  // reticle has to stay clear of whatever it actually ends up being.
  const [sheetHeight, setSheetHeight] = useState(220);

  const busy = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toIdle = useCallback(() => {
    busy.current = false;
    setStatus('idle');
    setHint(IDLE_HINT);
  }, []);

  // The scan screen stays mounted beneath the rest of the payment flow, so
  // without this the camera keeps running — and keeps firing scans — while the
  // user is on the amount, source or confirm screens.
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      toIdle();
      return () => {
        setIsFocused(false);
        setTorchOn(false);
        if (resetTimer.current) clearTimeout(resetTimer.current);
      };
    }, [toIdle])
  );

  // Backgrounding with the torch on drains the battery and leaves it lit on
  // some devices; the camera should also stop while we are not on screen.
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener('change', (next) => {
        if (next !== 'active') {
          setTorchOn(false);
          setIsFocused(false);
        } else {
          setIsFocused(true);
        }
      });
      return () => sub.remove();
    }, [])
  );

  /** Shared by the camera and the recents list — one resolution path. */
  const acceptPayload = useCallback(
    async (payload: string) => {
      if (busy.current) return;
      busy.current = true;

      setStatus('resolving');
      setHint('Reading code…');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      // §3.3 — a code that doesn't decode, or resolves to a payee with no
      // verifiable settlement destination, must not become a payment.
      const resolution = await resolvePayee({ type: 'qr', value: payload }, mockPayeeDirectory);

      if (!resolution.ok) {
        // Report next to the reticle, where the user is already looking — a
        // toast at the top of the screen is out of their field of view.
        setStatus('error');
        setHint(resolution.reason);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
        resetTimer.current = setTimeout(toIdle, ERROR_HOLD_MS);
        return;
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      const { payee, fixedAmount } = resolution;
      setPayee(payee, fixedAmount);

      // A merchant-pinned amount skips the amount step entirely — the price is
      // the merchant's to set, not the payer's.
      router.push(fixedAmount ? '/(consumer)/scan/source' : '/(consumer)/scan/amount');
      busy.current = false;
    },
    [setPayee, router, toIdle]
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      void acceptPayload(result.data);
    },
    [acceptPayload]
  );

  // ---- Permission states -------------------------------------------------

  if (!permission) {
    return <View style={styles.wrap} />;
  }

  if (!permission.granted) {
    // `canAskAgain` false means the OS will not re-prompt, so the in-app button
    // would silently do nothing — Settings is the only route left.
    const mustUseSettings = !permission.canAskAgain;

    return (
      <View style={[styles.wrap, styles.permissionWrap, { paddingTop: insets.top }]}>
        <View style={styles.permissionIconWrap}>
          <Icon name="camera-outline" size={30} color={Colors.primary} />
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          {mustUseSettings
            ? 'Camera access is turned off for Lenz Pay. Enable it in Settings to scan payment codes.'
            : 'Lenz Pay uses your camera to read merchant payment codes. Nothing is recorded or uploaded.'}
        </Text>

        <Button
          label={mustUseSettings ? 'Open Settings' : 'Allow Camera'}
          onPress={() => (mustUseSettings ? Linking.openSettings() : requestPermission())}
          style={styles.permissionButton}
        />
        <Button
          label="Enter details instead"
          variant="tertiary"
          onPress={() => router.push('/(consumer)/scan/payee')}
        />
      </View>
    );
  }

  // ---- Scanner -----------------------------------------------------------

  return (
    <View style={styles.wrap}>
      <QRViewport
        onScanned={handleBarcodeScanned}
        active={isFocused}
        scanning={status === 'idle'}
        torchOn={torchOn}
        status={status}
        hint={hint}
        topInset={insets.top + 56}
        bottomInset={sheetHeight}
      />

      <View style={[styles.topBar, { top: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Icon name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.topTitle}>Scan to Pay</Text>

        <TouchableOpacity
          onPress={() => setTorchOn((v) => !v)}
          style={[styles.iconButton, torchOn && styles.iconButtonActive]}
          accessibilityRole="switch"
          accessibilityLabel="Flashlight"
          accessibilityState={{ checked: torchOn }}
          hitSlop={8}
        >
          <Icon name="flashlight" size={19} color={torchOn ? Colors.onPrimary : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* A compact sheet rather than the old full-width panel, which covered
          roughly the bottom half of the camera. */}
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
      >
        <Text style={styles.sheetLabel}>Recent</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentRow}
        >
          {RECENT_PAYEES.map((recent) => (
            <TouchableOpacity
              key={recent.id}
              style={styles.recentChip}
              onPress={() => acceptPayload(buildPaymentQR({ payeeId: recent.id }))}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${recent.name}`}
            >
              {recent.bankCode ? (
                <BankLogo code={recent.bankCode} name={recent.name} size={22} />
              ) : (
                <Icon name="storefront" size={16} color={Colors.onSurfaceVariant} />
              )}
              <Text style={styles.recentName} numberOfLines={1}>
                {recent.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          onPress={() => router.push('/(consumer)/scan/payee')}
          style={styles.manualButton}
          accessibilityRole="button"
        >
          <Icon name="keypad" size={17} color={Colors.onPrimary} />
          <Text style={styles.manualButtonText}>Enter account or Lenz Tag</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },

  // ---- Permission ----
  permissionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.background,
    gap: Spacing.sm,
  },
  permissionIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primary + '1f',
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
    lineHeight: 20,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    maxWidth: 320,
  },
  permissionButton: { width: '100%' },

  // ---- Top bar ----
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: { backgroundColor: Colors.primary },
  topTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },

  // ---- Bottom sheet ----
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(14,14,15,0.92)',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  sheetLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
  },
  recentRow: { gap: Spacing.sm, paddingRight: Spacing.lg },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    maxWidth: 210,
  },
  recentName: {
    flexShrink: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.onSurface,
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
  },
  manualButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onPrimary,
  },
});
