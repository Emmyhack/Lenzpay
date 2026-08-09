import { Tabs, useSegments } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

const TAB_ICON: Record<string, string> = {
  index: '🏠',
  payments: '💳',
  analytics: '📊',
  settlement: '🏦',
  qr: '🔳',
};

export default function MerchantLayout() {
  const segments = useSegments();
  // "onboarding" nests its own Stack; without this, the parent Tabs keeps
  // rendering its bar underneath that Stack's screens — fullScreenModal
  // presentation only affects the Stack's own transition, not the ancestor
  // Tab Navigator's chrome.
  const hideTabBar = segments.includes('onboarding' as never);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.onSurfaceMuted,
        tabBarStyle: hideTabBar
          ? { display: 'none' }
          : {
              backgroundColor: Colors.surfaceContainerLow,
              borderTopColor: Colors.outlineVariant,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>{TAB_ICON[route.name] ?? '•'}</Text>,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="settlement" options={{ title: 'Settlement' }} />
      <Tabs.Screen name="qr" options={{ title: 'QR' }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="onboarding" options={{ href: null }} />
    </Tabs>
  );
}
