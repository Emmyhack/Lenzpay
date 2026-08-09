import { View, Text, Share, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { QRCode } from '@/components/scan/QRCode';
import { Button } from '@/components/ui/Button';
import { useMerchantStore } from '@/store/merchant';

export default function MerchantQRScreen() {
  const profile = useMerchantStore((s) => s.profile);

  const handleShare = () => {
    Share.share({ message: `Pay ${profile?.businessName ?? 'me'} on LenzPay: ${profile?.qrCodeValue}` });
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Payment QR" showBack={false} />

      <View style={styles.body}>
        <QRCode value={profile?.qrCodeValue ?? 'lenzpay://pay/unknown'} size={260} />
        <Text style={styles.businessName}>{profile?.businessName}</Text>
        <Text style={styles.hint}>Customers scan this to pay you directly — no card reader needed.</Text>

        <Button label="Share QR" onPress={handleShare} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
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
  button: {
    width: '100%',
  },
});
