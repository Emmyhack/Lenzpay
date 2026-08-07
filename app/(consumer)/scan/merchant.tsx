import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MerchantSheet } from '@/components/scan/MerchantSheet';
import { usePaymentStore } from '@/store/payment';

export default function MerchantScreen() {
  const router = useRouter();
  const merchant = usePaymentStore((s) => s.merchant);
  const reset = usePaymentStore((s) => s.reset);

  if (!merchant) {
    // Reached directly (e.g. deep link) without a scanned merchant in state.
    router.back();
    return null;
  }

  const handleContinue = () => {
    router.push('/(consumer)/scan/amount');
  };

  const handleScanAgain = () => {
    reset();
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <MerchantSheet merchant={merchant} onContinue={handleContinue} onScanAgain={handleScanAgain} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
