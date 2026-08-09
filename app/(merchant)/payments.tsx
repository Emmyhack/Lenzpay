import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { fetchMerchantPayments } from '@/services/merchant';
import type { MerchantPayment } from '@/types/merchant';

const STATUS_COLOR: Record<MerchantPayment['status'], string> = {
  completed: Colors.success,
  pending: Colors.warning,
  failed: Colors.error,
};

export default function MerchantPaymentsScreen() {
  const { data: payments, isLoading } = useQuery({ queryKey: ['merchant-payments'], queryFn: fetchMerchantPayments });

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Payments" />

      <FlatList
        data={payments ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isLoading ? <EmptyState icon="card-outline" title="No payments yet" /> : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.info}>
              <View style={styles.topRow}>
                <Text style={styles.payer}>{item.payerLabel}</Text>
                <Badge kind={item.mode === 'auto' ? 'AUTO' : item.mode === 'split' ? 'SPLIT' : 'DEFAULT'} label={item.mode === 'manual' ? 'MANUAL' : undefined} />
              </View>
              <Text style={styles.meta}>
                {item.timestamp.toLocaleDateString()} · {item.timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {item.txnRef}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>+₦{item.amountNGN.toLocaleString()}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
            </View>
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
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  info: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  payer: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.xs,
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Colors.success,
  },
  status: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
