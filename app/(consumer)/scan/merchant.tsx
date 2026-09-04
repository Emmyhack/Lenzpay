import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MerchantSheet } from '@/components/scan/MerchantSheet';
import { usePaymentStore } from '@/store/payment';

export default function MerchantScreen() {
  const router = useRouter();
  const merchant = usePaymentStore((s) => s.merchant);
  const reset = usePaymentStore((s) => s.reset);

  // Reached directly (deep link, notification, a Fast Refresh that landed here)
  // without a scanned merchant in state.
  //
  // This has to be an effect, not a render-phase call. Navigating while
  // rendering is a side effect in render, and because nothing pushed this
  // screen there is no history to pop — `back()` dispatched a `GO_BACK` that no
  // navigator handled. Sending the user to the scanner is both valid from a
  // cold start and the thing they actually need in order to get a merchant.
  useEffect(() => {
    if (!merchant) router.replace('/(consumer)/scan');
  }, [merchant, router]);

  if (!merchant) return null;

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
