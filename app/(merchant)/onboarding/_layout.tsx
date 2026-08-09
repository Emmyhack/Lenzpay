import { Stack } from 'expo-router';

// Presented as a full-screen modal so the parent Tabs' bottom bar doesn't
// bleed through during the one-time setup flow.
export default function MerchantOnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}>
      <Stack.Screen name="signup" />
      <Stack.Screen name="kyc" />
      <Stack.Screen name="settlement-setup" />
      <Stack.Screen name="qr-setup" />
    </Stack>
  );
}
