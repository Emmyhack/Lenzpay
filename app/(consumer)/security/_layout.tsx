import { Stack } from 'expo-router';

export default function SecurityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="alert" />
      <Stack.Screen name="pin-change" />
      <Stack.Screen name="limits" />
      <Stack.Screen name="devices" />
    </Stack>
  );
}
