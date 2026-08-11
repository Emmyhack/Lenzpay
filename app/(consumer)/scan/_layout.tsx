import { Stack } from 'expo-router';

export default function ScanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="merchant" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen name="payee" />
      <Stack.Screen name="amount" />
      <Stack.Screen name="source" />
      <Stack.Screen name="split" />
      <Stack.Screen name="confirm" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="processing" options={{ gestureEnabled: false }} />
      <Stack.Screen name="success" options={{ gestureEnabled: false }} />
      <Stack.Screen name="failed" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
