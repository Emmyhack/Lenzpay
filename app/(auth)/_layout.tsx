import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="pin-create" />
      <Stack.Screen name="biometrics" />
      <Stack.Screen name="kyc" />
      <Stack.Screen name="kyc-pending" />
    </Stack>
  );
}
