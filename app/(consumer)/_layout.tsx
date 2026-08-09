import { Tabs, useSegments } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

const TAB_ICON: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: 'home', inactive: 'home-outline' },
  scan: { active: 'scan', inactive: 'scan-outline' },
  history: { active: 'receipt', inactive: 'receipt-outline' },
  rewards: { active: 'star', inactive: 'star-outline' },
  security: { active: 'shield-checkmark', inactive: 'shield-checkmark-outline' },
};

// Sub-routes of the scan flow that take over the whole screen (merchant
// sheet, PIN/biometric gate, processing, success, failed) — the tab bar
// bleeding through here would let someone tab away mid-payment.
const TAB_BAR_HIDDEN_SEGMENTS = new Set(['merchant', 'confirm', 'processing', 'success', 'failed']);

export default function ConsumerLayout() {
  const segments = useSegments();
  const hideTabBar = segments.some((segment) => TAB_BAR_HIDDEN_SEGMENTS.has(segment));

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
        tabBarIcon: ({ color, focused }) => {
          const icons = TAB_ICON[route.name];
          return <Ionicons name={icons ? (focused ? icons.active : icons.inactive) : 'ellipse-outline'} size={22} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="rewards" options={{ title: 'Rewards' }} />
      <Tabs.Screen name="security" options={{ title: 'Security' }} />
      {/* Reachable via links, not shown as tabs */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="sources" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
