import { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { BalanceHero } from '@/components/wallet/BalanceHero';
import { RewardsStrip } from '@/components/wallet/RewardsStrip';
import { SourceScrollRow } from '@/components/wallet/SourceScrollRow';
import { QuickActions } from '@/components/shared/QuickActions';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { EmptyState } from '@/components/shared/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useSourcesStore } from '@/store/sources';
import { useAuthStore } from '@/store/auth';
import { useBalance } from '@/hooks/useBalance';
import { useFXRates } from '@/hooks/useFXRates';
import { useRewardsStore } from '@/store/rewards';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactions } from '@/services/payments';

function getInitials(fullName?: string) {
  if (!fullName) return undefined;
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const sources = useSourcesStore((s) => s.sources);
  const refreshBalances = useSourcesStore((s) => s.refreshBalances);
  const isRefreshingSources = useSourcesStore((s) => s.isLoading);
  const { totalNGN, sourceCount } = useBalance();
  const { data: rates } = useFXRates();
  const { points, tier, lifetimeCashbackNGN } = useRewardsStore();

  const { data: transactions, refetch: refetchTransactions } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: fetchTransactions,
  });

  const usdEquivalent = useMemo(() => (rates ? totalNGN / rates.USD_NGN : undefined), [rates, totalNGN]);

  const handleRefresh = useCallback(() => {
    refreshBalances();
    refetchTransactions();
  }, [refreshBalances, refetchTransactions]);

  const quickActions = useMemo(
    () => [
      { key: 'scan', label: 'Scan', icon: 'scan-outline' as const, iconColor: Colors.primary, iconBg: Colors.primary + '20', onPress: () => router.push('/(consumer)/scan') },
      { key: 'history', label: 'History', icon: 'receipt-outline' as const, iconColor: Colors.secondary, iconBg: Colors.secondary + '20', onPress: () => router.push('/(consumer)/history') },
      { key: 'security', label: 'Security', icon: 'shield-checkmark-outline' as const, iconColor: Colors.error, iconBg: Colors.error + '20', onPress: () => router.push('/(consumer)/security') },
      { key: 'rewards', label: 'Rewards', icon: 'star-outline' as const, iconColor: Colors.warning, iconBg: Colors.warning + '20', onPress: () => router.push('/(consumer)/rewards') },
    ],
    [router]
  );

  const recentTransactions = (transactions ?? []).slice(0, 4);

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshingSources} onRefresh={handleRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.header}>
        <View style={[styles.headerRow, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.wordmarkRow}>
            <Text style={styles.lenz}>Lenz</Text>
            <Text style={styles.pay}>Pay</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(consumer)/profile')}
            style={styles.avatar}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            {getInitials(user?.fullName) ? (
              <Text style={styles.avatarText}>{getInitials(user?.fullName)}</Text>
            ) : (
              <Icon name="person" size={18} color={Colors.onSurface} />
            )}
          </TouchableOpacity>
        </View>

        <BalanceHero totalNGN={totalNGN} usdEquivalent={usdEquivalent} sourceCount={sourceCount} />
        <RewardsStrip tier={tier} points={points} cashbackNGN={lifetimeCashbackNGN} onPress={() => router.push('/(consumer)/rewards')} />
      </View>

      <View style={styles.section}>
        <QuickActions actions={quickActions} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="My Sources" rightLabel="Manage" onPressRight={() => router.push('/(consumer)/sources')} padded />
        {sources.length > 0 ? (
          <SourceScrollRow sources={sources} onPressSource={(s) => router.push(`/(consumer)/sources/${s.id}`)} />
        ) : (
          <EmptyState
            icon="business-outline"
            title="No sources yet"
            message="Add a bank, wallet, USD account, or crypto wallet to start paying."
            ctaLabel="Add a source"
            onPressCta={() => router.push('/(consumer)/sources')}
          />
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Recent" rightLabel="See all" onPressRight={() => router.push('/(consumer)/history')} padded />
        {recentTransactions.length > 0 ? (
          recentTransactions.map((txn) => (
            <TransactionRow key={txn.id} transaction={txn} onPress={() => router.push(`/(consumer)/history/${txn.id}`)} />
          ))
        ) : (
          <EmptyState icon="receipt-outline" title="No transactions yet" message="Your payments will show up here." />
        )}
      </View>
    </ScrollView>
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
    backgroundColor: Colors.surfaceContainerLow,
    paddingBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  wordmarkRow: {
    flexDirection: 'row',
  },
  lenz: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: Colors.onSurface,
  },
  pay: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: Colors.primary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: Colors.onPrimary,
  },
  section: {
    marginTop: Spacing.xxl,
  },
});
