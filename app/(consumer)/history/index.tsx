import { useMemo, useState } from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Chip } from '@/components/ui/Chip';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { EmptyState } from '@/components/shared/EmptyState';
import { SpendBarChart, type DailySpend } from '@/components/charts/SpendBarChart';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { CategoryGrid, type CategoryBreakdown } from '@/components/charts/CategoryGrid';
import { fetchTransactions } from '@/services/payments';
import type { Transaction } from '@/types/payment';

const FILTERS = ['All', 'Transport', 'Food', 'Shopping', 'Crypto', 'Splits'] as const;
type Filter = (typeof FILTERS)[number];

const CATEGORY_ICON: Record<string, string> = {
  transport: '🚗',
  food: '☕',
  shopping: '🛒',
  crypto: '₿',
  other: '💳',
};

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateLabel(date: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'TODAY';
  if (date.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function matchesFilter(txn: Transaction, filter: Filter) {
  if (filter === 'All') return true;
  if (filter === 'Splits') return txn.mode === 'split';
  return txn.category === filter.toLowerCase();
}

export default function HistoryScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('All');

  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'all'],
    queryFn: fetchTransactions,
  });

  const filtered = useMemo(
    () => (transactions ?? []).filter((t) => matchesFilter(t, filter)),
    [transactions, filter]
  );

  const sections = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const txn of filtered) {
      const label = dateLabel(txn.timestamp);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(txn);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const weeklySpend: DailySpend[] = useMemo(() => {
    const now = new Date();
    // Build the last 7 calendar days oldest → today (today lands last, which
    // is what SpendBarChart highlights).
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - i));
      return { date, day: WEEKDAY_ABBR[date.getDay()], amountNGN: 0 };
    });

    for (const txn of transactions ?? []) {
      if (txn.direction !== 'debit') continue;
      const match = days.find((d) => d.date.toDateString() === txn.timestamp.toDateString());
      if (match) match.amountNGN += txn.amount;
    }

    return days.map(({ day, amountNGN }) => ({ day, amountNGN }));
  }, [transactions]);

  const categoryBreakdown: CategoryBreakdown[] = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const txn of transactions ?? []) {
      if (txn.direction !== 'debit') continue;
      totals[txn.category] = (totals[txn.category] ?? 0) + txn.amount;
    }
    return Object.entries(totals).map(([key, amountNGN]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      icon: CATEGORY_ICON[key] ?? '💳',
      amountNGN,
    }));
  }, [transactions]);

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="History" />

      <View style={styles.chipRow}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.chartSection}>
              <SectionTitle title="This Week" padded />
              <View style={styles.chartPadding}>
                <ChartErrorBoundary>
                  <SpendBarChart data={weeklySpend} />
                </ChartErrorBoundary>
              </View>
            </View>
            {categoryBreakdown.length > 0 ? (
              <View style={styles.chartSection}>
                <SectionTitle title="By Category" padded />
                <View style={styles.chartPadding}>
                  <CategoryGrid categories={categoryBreakdown} />
                </View>
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <TransactionRow transaction={item} onPress={() => router.push(`/(consumer)/history/${item.id}`)} />
        )}
        ListEmptyComponent={<EmptyState icon="🧾" title="No transactions" message="Nothing matches this filter yet." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xxxl,
  },
  chartSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  chartPadding: {
    paddingHorizontal: Spacing.xl,
  },
  sectionHeader: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
});
