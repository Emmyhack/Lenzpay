import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Badge } from '@/components/ui/Badge';
import { useSourcesStore } from '@/store/sources';
import type { SourceType } from '@/types/payment';

const ADD_OPTIONS: { key: SourceType; title: string; subtitle: string; icon: string; route: '/(consumer)/sources/bank' | '/(consumer)/sources/wallet' | '/(consumer)/sources/usd' | '/(consumer)/sources/crypto' }[] = [
  { key: 'bank', title: 'Nigerian Bank', subtitle: 'Access, GTBank, Zenith & more', icon: '🏦', route: '/(consumer)/sources/bank' },
  { key: 'wallet', title: 'Mobile Wallet', subtitle: 'OPay, Kuda, PalmPay, Moniepoint', icon: '📱', route: '/(consumer)/sources/wallet' },
  { key: 'usd', title: 'USD Account', subtitle: 'Grey, Geegpay, Chipper Cash', icon: '💵', route: '/(consumer)/sources/usd' },
  { key: 'crypto', title: 'Crypto Wallet', subtitle: 'BTC, USDT, ETH', icon: '₿', route: '/(consumer)/sources/crypto' },
];

export default function SourcesHubScreen() {
  const router = useRouter();
  const sources = useSourcesStore((s) => s.sources);

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Payment Sources" />

      <ScrollView contentContainerStyle={styles.content}>
        {sources.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Connected" padded />
            {sources.map((source) => (
              <TouchableOpacity
                key={source.id}
                onPress={() => router.push(`/(consumer)/sources/${source.id}`)}
                style={styles.connectedRow}
                activeOpacity={0.8}
              >
                <Text style={styles.connectedFlag}>{source.flag}</Text>
                <View style={styles.connectedInfo}>
                  <Text style={styles.connectedLabel}>
                    {source.label} {source.accountMask}
                  </Text>
                  <Text style={styles.connectedBalance}>₦{Math.round(source.balance).toLocaleString()}</Text>
                </View>
                {source.isDefault ? <Badge kind="DEFAULT" /> : null}
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle title="Add a Source" padded />
          {ADD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => router.push(option.route)}
              style={styles.optionCard}
              activeOpacity={0.8}
            >
              <Text style={styles.optionIcon}>{option.icon}</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
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
  section: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  connectedFlag: { fontSize: 20 },
  connectedInfo: { flex: 1 },
  connectedLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  connectedBalance: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  chevron: {
    color: Colors.onSurfaceMuted,
    fontSize: 18,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  optionIcon: { fontSize: 22 },
  optionInfo: { flex: 1 },
  optionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  optionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});
