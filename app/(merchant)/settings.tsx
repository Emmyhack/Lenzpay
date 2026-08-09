import { useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Badge, type BadgeKind } from '@/components/ui/Badge';
import { useMerchantStore } from '@/store/merchant';
import { showToast } from '@/components/ui/Toast';

export default function MerchantSettingsScreen() {
  const router = useRouter();
  const profile = useMerchantStore((s) => s.profile);

  const handleLogout = () => {
    showToast('info', 'Signed out');
    router.replace('/(auth)');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Business Settings" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionTitle title="Business Profile" />
          <View style={styles.card}>
            <InfoRow label="Business name" value={profile?.businessName ?? '—'} />
            <InfoRow label="Category" value={profile?.category ?? '—'} />
            <InfoRow label="KYC status" value={profile?.kycStatus ?? '—'} />
            <InfoRow label="Settlement account" value={profile?.settlementAccountLabel ?? '—'} last />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Accepted Currencies" />
          <View style={styles.currencyRow}>
            {(profile?.acceptedCurrencies ?? []).map((code) => (
              <Badge key={code} kind={code as BadgeKind} />
            ))}
          </View>
        </View>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutRow}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.divider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  infoLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  infoValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
    textTransform: 'capitalize',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
