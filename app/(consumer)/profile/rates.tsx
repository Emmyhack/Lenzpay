import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { CryptoLogo, hasCryptoLogo } from '@/components/ui/CryptoLogo';
import { useFXRates } from '@/hooks/useFXRates';

interface RateRow {
  code: string;
  ngnValue: number;
  // Real-world currencies show their national flag; crypto assets (which have
  // no flag) render their exact coin logo instead.
  flag?: string;
}

export default function RatesScreen() {
  const { data: rates, isFetching, refetch } = useFXRates();

  const rows: RateRow[] = rates
    ? [
        { code: 'USD', flag: '🇺🇸', ngnValue: rates.USD_NGN },
        { code: 'GBP', flag: '🇬🇧', ngnValue: rates.GBP_NGN },
        { code: 'EUR', flag: '🇪🇺', ngnValue: rates.EUR_NGN },
        { code: 'BTC', ngnValue: rates.BTC_NGN },
        { code: 'ETH', ngnValue: rates.ETH_NGN },
        { code: 'USDT', ngnValue: rates.USDT_NGN },
      ]
    : [];

  return (
    <View style={styles.wrap}>
      <ScreenHeader
        title="Live FX Rates"
        subtitle={rates ? `Updated ${rates.updatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : undefined}
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.primary} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.left}>
              {item.flag ? (
                <Text style={styles.flag}>{item.flag}</Text>
              ) : hasCryptoLogo(item.code) ? (
                <CryptoLogo code={item.code} size={28} />
              ) : null}
              <Text style={styles.code}>{item.code}</Text>
            </View>
            <Text style={styles.value}>₦{item.ngnValue.toLocaleString()}</Text>
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
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flag: { fontSize: 20 },
  code: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  value: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.primary,
  },
});
