import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { QRCode } from '@/components/scan/QRCode';
import { Button } from '@/components/ui/Button';
import { useMerchantStore } from '@/store/merchant';

export default function QRSetupScreen() {
  const router = useRouter();
  const profile = useMerchantStore((s) => s.profile);
  const completeOnboarding = useMerchantStore((s) => s.completeOnboarding);

  const handleFinish = () => {
    completeOnboarding();
    router.replace('/(merchant)');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Your Payment QR" subtitle="Step 4 of 4" />

      <View style={styles.body}>
        <QRCode value={profile?.qrCodeValue ?? 'lenzpay://pay/unknown'} />
        <Text style={styles.businessName}>{profile?.businessName}</Text>
        <Text style={styles.hint}>
          Print this or display it at checkout — customers scan it to pay you directly from any connected source.
        </Text>

        <Button label="Finish Setup" trailingArrow onPress={handleFinish} style={styles.button} />
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
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
