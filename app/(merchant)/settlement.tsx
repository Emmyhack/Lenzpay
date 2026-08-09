import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useMerchantStore } from '@/store/merchant';
import { fetchSettlements } from '@/services/merchant';
import type { Settlement, SettlementStatus } from '@/types/merchant';

const STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  settled: 'Settled',
  failed: 'Failed',
};

const STATUS_COLOR: Record<SettlementStatus, string> = {
  pending: Colors.warning,
  processing: Colors.secondary,
  settled: Colors.success,
  failed: Colors.error,
};

export default function SettlementScreen() {
  const profile = useMerchantStore((s) => s.profile);
  const { data: settlements, isLoading } = useQuery({ queryKey: ['merchant-settlements'], queryFn: fetchSettlements });

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Settlements" subtitle={profile?.settlementAccountLabel} />

      <FlatList
        data={settlements ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!isLoading ? <EmptyState icon="business-outline" title="No settlements yet" /> : null}
        renderItem={({ item }) => <SettlementCard settlement={item} />}
      />
    </View>
  );
}

function SettlementCard({ settlement }: { settlement: Settlement }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.amount}>₦{settlement.amountNGN.toLocaleString()}</Text>
        <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[settlement.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[settlement.status] }]}>{STATUS_LABEL[settlement.status]}</Text>
        </View>
      </View>
      <Text style={styles.meta}>{settlement.bankLabel} · {settlement.txnCount} transactions</Text>
      <Text style={styles.meta}>Ref: {settlement.reference}</Text>
      <Text style={styles.date}>
        Initiated {settlement.initiatedAt.toLocaleDateString()}
        {settlement.settledAt ? ` · Settled ${settlement.settledAt.toLocaleDateString()}` : ''}
      </Text>
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
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  statusPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  statusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  date: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.sm,
  },
});
