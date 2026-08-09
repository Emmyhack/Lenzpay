import { Stack } from 'expo-router';

export default function RewardsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="redeem" />
      <Stack.Screen name="tiers" />
    </Stack>
  );
}
