import { useMemo, useState } from 'react';
import { View, Text, TextInput, Share, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { QRCode } from '@/components/scan/QRCode';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { useMerchantStore } from '@/store/merchant';
import { buildPaymentQR } from '@/services/payee';
import { MERCHANT_PAYEE_ID } from '@/mock/merchant';

type Mode = 'open' | 'amount';

/**
 * The merchant's payment QR.
 *
 * Two modes, because merchants need both: a standing code taped to a counter
 * (open — payer types the amount) and a per-sale code for an exact price
 * (amount — payer just confirms). The pinned amount travels in the payload, so
 * the consumer app skips its amount step entirely.
 *
 * The payload always comes from `buildPaymentQR`; hand-written URIs are how the
 * app ended up unable to scan its own codes.
 */
export default function MerchantQRScreen() {
  const profile = useMerchantStore((s) => s.profile);
  const [mode, setMode] = useState<Mode>('open');
  const [raw, setRaw] = useState('');

  const amount = mode === 'amount' && raw ? Number(raw) : undefined;

  const qrValue = useMemo(
    () =>
      buildPaymentQR({
        payeeId: profile?.id ?? MERCHANT_PAYEE_ID,
        displayName: profile?.businessName,
        currency: 'NGN',
        amount,
      }),
    [profile?.id, profile?.businessName, amount]
  );

  const handleShare = () => {
    const label = amount
      ? `Pay ₦${amount.toLocaleString()} to ${profile?.businessName ?? 'me'} on LenzPay`
      : `Pay ${profile?.businessName ?? 'me'} on LenzPay`;
    Share.share({ message: `${label}: ${qrValue}` });
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Payment QR" showBack={false} />

      <View style={styles.body}>
        <Segmented
          style={styles.modes}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'open', label: 'Any amount' },
            { value: 'amount', label: 'Set amount' },
          ]}
        />

        {mode === 'amount' ? (
          <View style={styles.amountField}>
            <Text style={styles.currency}>₦</Text>
            <TextInput
              value={raw}
              onChangeText={(text) => setRaw(text.replace(/\D/g, '').slice(0, 9))}
              placeholder="0"
              placeholderTextColor={Colors.onSurfaceMuted}
              keyboardType="number-pad"
              style={styles.amountInput}
            />
            {raw ? (
              <TouchableOpacity onPress={() => setRaw('')} hitSlop={8}>
                <Icon name="close" size={18} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <QRCode value={qrValue} size={240} />

        <Text style={styles.businessName}>{profile?.businessName}</Text>
        <Text style={styles.hint}>
          {amount
            ? `Customers scan and confirm ₦${amount.toLocaleString()} — no amount to type.`
            : 'Customers scan this to pay you directly — no card reader needed.'}
        </Text>

        <Button label="Share QR" onPress={handleShare} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modes: { alignSelf: 'stretch', marginBottom: Spacing.xl },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  currency: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.headlineSm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineSm.fontSize,
    color: Colors.onSurface,
    paddingVertical: Spacing.md,
  },
  businessName: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
    marginTop: Spacing.xl,
  },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  button: { width: '100%' },
});
