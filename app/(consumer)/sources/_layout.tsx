import { Stack } from 'expo-router';

export default function SourcesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="bank" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="usd" />
      <Stack.Screen name="crypto" />
    </Stack>
  );
}
