import { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { MOCK_DEVICES, type TrustedDevice } from '@/mock/devices';
import { showToast } from '@/components/ui/Toast';

function timeAgo(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Active now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DevicesScreen() {
  const [devices, setDevices] = useState(MOCK_DEVICES);

  const handleSignOut = (device: TrustedDevice) => {
    setDevices((prev) => prev.filter((d) => d.id !== device.id));
    showToast('success', `Signed out ${device.name}`);
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Trusted Devices" />

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Icon name={item.icon} size={20} color={Colors.onSurface} />
            </View>
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{item.name}</Text>
                {item.isCurrent ? <Badge kind="DEFAULT" label="This device" /> : null}
              </View>
              <Text style={styles.meta}>
                {item.location} · {timeAgo(item.lastActive)}
              </Text>
            </View>
            {!item.isCurrent ? (
              <TouchableOpacity onPress={() => handleSignOut(item)} style={styles.signOutButton}>
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  signOutButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  signOutText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.error,
  },
});
