import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuthStore } from '@/store/auth';
import { showToast } from '@/components/ui/Toast';

interface ProfileLink {
  key: string;
  label: string;
  icon: IconName;
  route: '/(consumer)/profile/settings' | '/(consumer)/profile/rates' | '/(consumer)/profile/support' | '/(consumer)/security' | '/(consumer)/sources';
}

const LINKS: ProfileLink[] = [
  { key: 'sources', label: 'Payment Sources', icon: 'business-outline', route: '/(consumer)/sources' },
  { key: 'security', label: 'Security', icon: 'shield-checkmark-outline', route: '/(consumer)/security' },
  { key: 'rates', label: 'Live FX Rates', icon: 'swap-horizontal-outline', route: '/(consumer)/profile/rates' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', route: '/(consumer)/profile/settings' },
  { key: 'support', label: 'Help & Support', icon: 'chatbubble-outline', route: '/(consumer)/profile/support' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const initials = user?.avatarInitials;

  const handleLogout = () => {
    logout();
    showToast('info', 'Signed out');
    router.replace('/(auth)');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Profile" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarText}>{initials}</Text>
            ) : (
              <Icon name="person" size={28} color={Colors.onSurface} />
            )}
          </View>
          <Text style={styles.name}>{user?.fullName ?? 'Guest'}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          {user?.kycStatus === 'verified' ? (
            <Badge kind="VERIFIED" label="KYC Verified" style={styles.verifiedBadge} />
          ) : null}
        </View>

        <View style={styles.linkList}>
          {LINKS.map((link) => (
            <TouchableOpacity key={link.key} onPress={() => router.push(link.route)} style={styles.linkRow}>
              <Icon name={link.icon} size={20} color={Colors.onSurfaceVariant} />
              <Text style={styles.linkLabel}>{link.label}</Text>
              <Icon name="chevron-forward" size={18} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutRow}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
    color: Colors.onPrimary,
  },
  name: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineSm.fontSize,
    color: Colors.onSurface,
  },
  phone: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  verifiedBadge: {
    alignSelf: 'center',
  },
  linkList: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  linkLabel: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  logoutRow: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    padding: Spacing.md,
  },
  logoutText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.error,
  },
});
