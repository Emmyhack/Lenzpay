import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Badge, type BadgeKind } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CryptoLogo, hasCryptoLogo } from '@/components/ui/CryptoLogo';
import { BankLogo } from '@/components/ui/BankLogo';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { EmptyState } from '@/components/shared/EmptyState';
import { ToggleRow } from '@/components/shared/ToggleRow';
import { Slider } from '@/components/ui/Slider';
import { DEFAULT_PRIORITY_WEIGHT } from '@/types/payment';
import { useSourcesStore } from '@/store/sources';
import { MOCK_TRANSACTIONS } from '@/mock/data';
import { showToast } from '@/components/ui/Toast';
import { paymentEngine, guaranteeFor, spendableBalance } from '@/services/orchestration';
import { capabilityPresentation } from '@/components/payment/GuaranteeRows';

function UsageBar({ ratio }: { ratio: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.min(ratio, 1) * 100, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [ratio, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.usageTrack}>
      <Animated.View style={[styles.usageFill, style]} />
    </View>
  );
}

export default function SourceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sources = useSourcesStore((s) => s.sources);
  const setDefault = useSourcesStore((s) => s.setDefault);
  const setPriorityWeight = useSourcesStore((s) => s.setPriorityWeight);
  const setReserve = useSourcesStore((s) => s.setReserve);
  const removeSource = useSourcesStore((s) => s.removeSource);
  const refreshBalances = useSourcesStore((s) => s.refreshBalances);
  const isLoading = useSourcesStore((s) => s.isLoading);

  const [confirmRemove, setConfirmRemove] = useState(false);

  const source = sources.find((s) => s.id === id);

  // Deterministic-looking mock "spent this month" figure, scoped to this source.
  const spentThisMonth = useMemo(() => (source ? Math.round(source.balance * 0.28) : 0), [source]);

  const relatedTransactions = useMemo(
    () => (source ? MOCK_TRANSACTIONS.filter((t) => t.sourceLabel.includes(source.label)) : []),
    [source]
  );

  if (!source) {
    return (
      <View style={styles.wrap}>
        <ScreenHeader title="Source" />
        <EmptyState icon="business-outline" title="Source not found" message="This account may have been removed." />
      </View>
    );
  }

  const priorityWeight = source.priorityWeight ?? DEFAULT_PRIORITY_WEIGHT;

  const handleRemove = () => {
    removeSource(source.id);
    setConfirmRemove(false);
    router.back();
  };

  const capabilities = paymentEngine.capabilities().resolve(source);
  const guarantee = capabilityPresentation(guaranteeFor(capabilities));
  const spendable = spendableBalance(source);
  const withheld = Math.max(0, source.rawBalance - spendable);

  return (
    <View style={styles.wrap}>
      <ScreenHeader title={source.label} subtitle={source.accountMask} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          {source.icon ? (
            <View style={[styles.iconWrap, { backgroundColor: source.iconColor + '20' }]}>
              <Icon name={source.icon} size={22} color={source.iconColor} />
            </View>
          ) : hasCryptoLogo(source.rawCurrency) ? (
            <CryptoLogo code={source.rawCurrency} size={44} />
          ) : source.bankCode ? (
            <BankLogo code={source.bankCode} name={source.label} size={44} />
          ) : (
            <Text style={styles.flag}>{source.flag}</Text>
          )}
          <Badge kind={(source.rawCurrency === 'NGN' ? 'NGN' : source.rawCurrency) as BadgeKind} />
        </View>

        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balance}>₦{Math.round(source.balance).toLocaleString()}</Text>
        {withheld > 0 ? (
          <Text style={styles.balanceSpendable}>
            ₦{Math.round(spendable).toLocaleString()} available · ₦
            {Math.round(withheld).toLocaleString()} already committed
          </Text>
        ) : null}

        {/* What this source can actually do (ADR-012). Users are entitled to
            know which of their accounts can be held and which cannot — it is
            the difference between a payment that is secured and one Lenz is
            underwriting on their behalf. */}
        <View style={styles.capabilityRow}>
          <Icon name={guarantee.icon} size={13} color={guarantee.color} />
          <Text style={[styles.capabilityLabel, { color: guarantee.color }]}>
            {guarantee.label}
          </Text>
          <Text style={styles.capabilityDetail}>{guarantee.detail}</Text>
        </View>
        <Text style={styles.capabilityNote}>
          {capabilities.balanceVisibility === 'none'
            ? 'Your issuer doesn’t share this balance with us, so we authorise the funds instead of reading them.'
            : `Balance last checked ${formatAge(source.lastSynced)}.`}
        </Text>

        <View style={styles.actionsRow}>
          <Button
            label={source.isDefault ? 'Default' : 'Set Default'}
            icon={source.isDefault ? 'flash' : undefined}
            variant="secondary"
            onPress={() => setDefault(source.id)}
            disabled={source.isDefault}
            fullWidth={false}
            style={styles.actionButton}
          />
          <Button
            label="Refresh"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              refreshBalances();
              showToast('success', 'Balance refreshed');
            }}
            loading={isLoading}
            fullWidth={false}
            style={styles.actionButton}
          />
        </View>

        <View style={styles.usageSection}>
          <View style={styles.usageLabelRow}>
            <Text style={styles.usageLabel}>Spent this month</Text>
            <Text style={styles.usageValue}>
              ₦{spentThisMonth.toLocaleString()} / ₦{Math.round(source.balance).toLocaleString()}
            </Text>
          </View>
          <UsageBar ratio={source.balance > 0 ? spentThisMonth / source.balance : 0} />
        </View>

        {/* §5.2 — the two ranking inputs the user owns. Everything else in
            priority_score (currency proximity, conversion cost, reliability)
            is derived; these two are theirs to set. */}
        <View style={styles.prefsSection}>
          <SectionTitle title="Funding Preferences" />

          <View style={styles.prefRow}>
            <View style={styles.prefLabelRow}>
              <Text style={styles.prefTitle}>Priority</Text>
              <Text style={styles.prefValue}>{priorityWeight}</Text>
            </View>
            <Text style={styles.prefSubtitle}>
              How strongly Smart Funding prefers this account over your others.
            </Text>
            <Slider
              value={priorityWeight / 100}
              onChange={(value) => setPriorityWeight(source.id, value * 100)}
            />
          </View>

          <ToggleRow
            title="Keep as reserve"
            subtitle="Only use this account when nothing else can cover the payment."
            value={source.isReserve ?? false}
            onValueChange={(value) => setReserve(source.id, value)}
            last
          />
        </View>

        <View style={styles.section}>
          <SectionTitle title="Recent Activity" padded />
          {relatedTransactions.length > 0 ? (
            relatedTransactions.map((txn) => <TransactionRow key={txn.id} transaction={txn} />)
          ) : (
            <EmptyState icon="receipt-outline" title="No activity yet" />
          )}
        </View>

        <TouchableOpacity onPress={() => setConfirmRemove(true)} style={styles.removeRow}>
          <Text style={styles.removeText}>Remove this source</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={confirmRemove} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove {source.label}?</Text>
            <Text style={styles.modalBody}>You can add it back anytime. This won't affect past transactions.</Text>
            <Button label="Remove" variant="destructive" onPress={handleRemove} style={styles.modalButton} />
            <Button label="Cancel" variant="tertiary" onPress={() => setConfirmRemove(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  flag: { fontSize: 32 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
  },
  balance: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    color: Colors.onSurface,
    marginTop: Spacing.xs,
  },
  balanceSpendable: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    marginTop: 2,
  },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  capabilityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  capabilityDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  capabilityNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  actionButton: {
    flex: 1,
  },
  usageSection: {
    marginTop: Spacing.xxl,
  },
  usageLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  usageLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  usageValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
  },
  usageTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  section: {
    marginTop: Spacing.xxl,
    marginHorizontal: -Spacing.xl,
  },
  prefsSection: {
    marginTop: Spacing.xxl,
  },
  prefRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    gap: Spacing.sm,
  },
  prefLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prefTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  prefValue: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.primary,
  },
  prefSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  removeRow: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
    padding: Spacing.md,
  },
  removeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.surfaceBright,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  modalTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  modalBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  modalButton: {
    marginBottom: Spacing.md,
  },
});

/** Relative age of a balance reading, for the freshness note. */
function formatAge(lastSynced: Date): string {
  const minutes = Math.floor((Date.now() - lastSynced.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
