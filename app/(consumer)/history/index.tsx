import { useMemo, useState } from 'react';
import { View, Text, SectionList, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { EmptyState } from '@/components/shared/EmptyState';
import { SpendBarChart, type DailySpend } from '@/components/charts/SpendBarChart';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { CategoryGrid, type CategoryBreakdown } from '@/components/charts/CategoryGrid';
import { fetchTransactions } from '@/services/payments';
import { CATEGORY_ICON } from '@/mock/data';
import type { Transaction } from '@/types/payment';

const FILTERS = ['All', 'Transport', 'Food', 'Shopping', 'Crypto', 'Splits'] as const;
type Filter = (typeof FILTERS)[number];

type Tab = 'activity' | 'insights';

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateLabel(date: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function matchesFilter(txn: Transaction, filter: Filter) {
  if (filter === 'All') return true;
  if (filter === 'Splits') return txn.mode === 'split';
  return txn.category === filter.toLowerCase();
}

function compactNGN(amount: number) {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 10_000) return `₦${Math.round(amount / 1_000)}k`;
  return `₦${amount.toLocaleString()}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('activity');
  const [filter, setFilter] = useState<Filter>('All');

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', 'all'],
    queryFn: fetchTransactions,
  });

  const filtered = useMemo(
    () => (transactions ?? []).filter((t) => matchesFilter(t, filter)),
    [transactions, filter]
  );

  /** Headline figures for whatever the current filter has selected. */
  const summary = useMemo(() => {
    let out = 0;
    let inbound = 0;
    for (const txn of filtered) {
      if (txn.direction === 'debit') out += txn.amount;
      else inbound += txn.amount;
    }
    return { out, inbound, count: filtered.length };
  }, [filtered]);

  // Day groups carry their own total, so each header answers "what did this day
  // cost me?" without the user adding rows up themselves.
  const sections = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const txn of filtered) {
      const label = dateLabel(txn.timestamp);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(txn);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({
      title,
      data,
      total: data.reduce((sum, t) => sum + (t.direction === 'debit' ? t.amount : -t.amount), 0),
    }));
  }, [filtered]);

  const weeklySpend: DailySpend[] = useMemo(() => {
    const now = new Date();
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
    return Object.entries(totals)
      .map(([key, amountNGN]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        icon: CATEGORY_ICON[key] ?? CATEGORY_ICON.other,
        amountNGN,
      }))
      .sort((a, b) => b.amountNGN - a.amountNGN);
  }, [transactions]);

  return (
    <View style={styles.wrap}>
      {/* The headline number replaces the old bare "History" title — the first
          thing you want from this screen is how much went out. */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
        <Text style={styles.eyebrow}>Total spent</Text>
        {isLoading ? (
          <Skeleton width={180} height={40} />
        ) : (
          <Text style={styles.total}>₦{summary.out.toLocaleString()}</Text>
        )}

        <View style={styles.statRow}>
          <Stat label="Payments" value={String(summary.count)} />
          <View style={styles.statDivider} />
          <Stat label="Received" value={compactNGN(summary.inbound)} tone={Colors.success} />
          <View style={styles.statDivider} />
          <Stat
            label="Avg"
            value={compactNGN(summary.count > 0 ? Math.round(summary.out / summary.count) : 0)}
          />
        </View>

        <Segmented
          style={styles.tabs}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'activity', label: 'Activity', icon: 'receipt-outline' },
            { value: 'insights', label: 'Insights', icon: 'stats-chart' },
          ]}
        />
      </View>

      {tab === 'activity' ? (
        <>
          {/* Horizontal scroll, not flexWrap — six filters used to wrap into a
              ragged second row that shifted the list down. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={styles.chipScroll}
          >
            {FILTERS.map((f) => (
              <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled
            showsVerticalScrollIndicator={false}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionTotal}>
                  {section.total >= 0 ? '−' : '+'}₦{Math.abs(section.total).toLocaleString()}
                </Text>
              </View>
            )}
            renderItem={({ item, index }) => (
              <TransactionRow
                transaction={item}
                showTime
                divided={index > 0}
                onPress={() => router.push(`/(consumer)/history/${item.id}`)}
              />
            )}
            SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.skeletons}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} height={64} style={styles.skeletonRow} />
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="receipt-outline"
                  title="No transactions"
                  message={
                    filter === 'All'
                      ? 'Payments you make will show up here.'
                      : `Nothing matches "${filter}" yet.`
                  }
                />
              )
            }
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.insights} showsVerticalScrollIndicator={false}>
          <View style={styles.chartSection}>
            <SectionTitle title="This Week" />
            <ChartErrorBoundary>
              <SpendBarChart data={weeklySpend} />
            </ChartErrorBoundary>
          </View>

          {categoryBreakdown.length > 0 ? (
            <View style={styles.chartSection}>
              <SectionTitle title="By Category" />
              <CategoryGrid categories={categoryBreakdown} />
            </View>
          ) : (
            <EmptyState
              icon="stats-chart"
              title="Not enough data yet"
              message="Spending insights appear once you've made a few payments."
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
  },
  total: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    letterSpacing: Typography.displayMd.letterSpacing,
    color: Colors.onSurface,
    marginTop: Spacing.xs,
  },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 26, backgroundColor: Colors.outlineVariant },
  statValue: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
  },

  tabs: { marginTop: Spacing.lg },

  chipScroll: { flexGrow: 0, marginTop: Spacing.lg },
  chipRow: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },

  listContent: { paddingBottom: Spacing.xxxl },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  sectionTotal: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
  },
  sectionGap: { height: Spacing.md },

  skeletons: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  skeletonRow: { borderRadius: Radius.md },

  insights: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxxl },
  chartSection: { marginTop: Spacing.lg, marginBottom: Spacing.xl },
});
