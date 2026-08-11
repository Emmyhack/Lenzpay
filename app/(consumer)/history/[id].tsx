import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Share,
  ScrollView,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { BankLogo } from '@/components/ui/BankLogo';
import { CryptoLogo, hasCryptoLogo } from '@/components/ui/CryptoLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchTransactionById } from '@/services/payments';
import {
  DISPUTE_REASON_LABEL,
  disputeQueue,
  isDisputable,
  type DisputeReason,
} from '@/services/disputes';
import { showToast } from '@/components/ui/Toast';
import { CATEGORY_ICON } from '@/mock/data';
import type { FundingLeg } from '@/types/orchestration';
import type { Transaction } from '@/types/payment';

function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS: Record<Transaction['status'], { label: string; tone: string; icon: IconName }> = {
  completed: { label: 'Settled', tone: Colors.success, icon: 'checkmark-circle' },
  pending: { label: 'Pending', tone: Colors.warning, icon: 'time' },
  failed: { label: 'Failed', tone: Colors.error, icon: 'close-circle' },
};

const MODE_LABEL: Record<Transaction['mode'], string> = {
  auto: 'Auto',
  manual: 'Manual',
  split: 'Smart Split',
};

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(undefined);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputedLegIds, setDisputedLegIds] = useState<string[]>([]);

  useEffect(() => {
    fetchTransactionById(id).then((t) => setTransaction(t ?? null));
  }, [id]);

  if (transaction === undefined) {
    return (
      <View style={styles.wrap}>
        <ScreenHeader title="Transaction" />
        <View style={styles.loading}>
          <Skeleton width={64} height={64} radius={32} />
          <Skeleton width={200} height={40} />
          <Skeleton height={180} radius={Radius.lg} />
        </View>
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={styles.wrap}>
        <ScreenHeader title="Transaction" />
        <EmptyState icon="receipt-outline" title="Transaction not found" />
      </View>
    );
  }

  const isCredit = transaction.direction === 'credit';
  const status = STATUS[transaction.status];
  const legs = transaction.legs ?? [];
  const fees = transaction.totalFees ?? 0;
  const pending = transaction.pendingCollection ?? [];

  const handleCopyRef = async () => {
    await Clipboard.setStringAsync(transaction.txnRef);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('success', 'Copied', transaction.txnRef);
  };

  /**
   * §7 — a partial reversal is a first-class operation. A user whose bank leg
   * settled fine but whose crypto leg never arrived should be able to dispute
   * just that leg, not the whole payment.
   */
  const submitDispute = (reason: DisputeReason) => {
    const disputedLegs = legs.filter((leg) => disputedLegIds.includes(leg.id));
    const dispute = disputeQueue.raise({
      transaction,
      reason,
      legs: disputedLegs.length > 0 ? disputedLegs : undefined,
    });

    setDisputeOpen(false);
    setDisputedLegIds([]);
    showToast(
      'success',
      'Report received',
      `We're looking into ₦${dispute.amount.toLocaleString()} · ref ${dispute.txnRef}`
    );
  };

  const toggleDisputedLeg = (legId: string) =>
    setDisputedLegIds((current) =>
      current.includes(legId) ? current.filter((id) => id !== legId) : [...current, legId]
    );

  const handleShare = () => {
    const breakdown = legs.length > 1 ? `\n${legs.map(describeLeg).join('\n')}` : '';
    Share.share({
      message: `LenzPay receipt\n₦${transaction.amount.toLocaleString()} · ${transaction.merchantName}${breakdown}\nRef: ${transaction.txnRef}\n${formatDateTime(transaction.timestamp)}`,
    });
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Transaction" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Icon
            name={CATEGORY_ICON[transaction.category] ?? CATEGORY_ICON.other}
            size={28}
            color={Colors.onSurface}
          />
        </View>

        <Text style={[styles.amount, { color: isCredit ? Colors.success : Colors.onSurface }]}>
          {isCredit ? '+' : '−'}₦{transaction.amount.toLocaleString()}
        </Text>
        <Text style={styles.merchant}>{transaction.merchantName}</Text>

        <View style={[styles.statusPill, { backgroundColor: status.tone + '1f' }]}>
          <Icon name={status.icon} size={13} color={status.tone} />
          <Text style={[styles.statusText, { color: status.tone }]}>{status.label}</Text>
        </View>

        <Text style={styles.datetime}>{formatDateTime(transaction.timestamp)}</Text>

        {/* §5.4 — a split payment is only auditable if the receipt says which
            account paid what, at what rate, for what fee. */}
        {legs.length > 0 ? (
          <Card variant="containerLow" style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Funded by</Text>
              {legs.length > 1 ? (
                <Text style={styles.sectionMeta}>{legs.length} sources</Text>
              ) : null}
            </View>

            {legs.map((leg, index) => (
              <LegRow key={leg.id} leg={leg} divided={index > 0} />
            ))}
          </Card>
        ) : null}

        {pending.length > 0 ? (
          <View style={styles.pendingBanner}>
            <Icon name="time-outline" size={15} color={Colors.onSurfaceVariant} />
            <Text style={styles.pendingText}>
              {pending.map((leg) => leg.source.label).join(' and ')}{' '}
              {pending.length > 1 ? 'are' : 'is'} still being debited.{' '}
              {transaction.merchantName} already has the full amount.
            </Text>
          </View>
        ) : null}

        <Card variant="containerLow" style={styles.section}>
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <Row label="Amount" value={`₦${transaction.amount.toLocaleString()}`} />
          <Row
            label="Conversion cost"
            value={fees > 0 ? `₦${Math.round(fees).toLocaleString()}` : 'None'}
            muted={fees === 0}
          />
          <Row
            label="Total debited"
            value={`₦${Math.round(transaction.amount + fees).toLocaleString()}`}
            emphasis
          />
        </Card>

        <Card variant="containerLow" style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Row label="Funding mode" value={MODE_LABEL[transaction.mode]} />
          <Row
            label="Rewards"
            value={`${transaction.pointsEarned} pts · ₦${transaction.cashbackNGN.toLocaleString()} back`}
          />
          <TouchableOpacity onPress={handleCopyRef} style={styles.row} accessibilityRole="button">
            <Text style={styles.rowLabel}>Reference</Text>
            <View style={styles.refRow}>
              <Text style={styles.refValue}>{transaction.txnRef}</Text>
              <Icon name="copy-outline" size={13} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        </Card>

        <View style={styles.actions}>
          <Button label="Share Receipt" onPress={handleShare} />
          {isDisputable(transaction) ? (
            <Button
              label="Report a problem"
              variant="tertiary"
              onPress={() => setDisputeOpen(true)}
            />
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={disputeOpen} transparent animationType="slide">
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>What went wrong?</Text>
            <Text style={styles.sheetBody}>
              ₦{transaction.amount.toLocaleString()} to {transaction.merchantName}
            </Text>

            {/* Only offered on a split — picking a leg is meaningless when
                there is only one. */}
            {legs.length > 1 ? (
              <View style={styles.legPicker}>
                <Text style={styles.legPickerLabel}>
                  Which part? Leave blank to report the whole payment.
                </Text>
                {legs.map((leg) => {
                  const selected = disputedLegIds.includes(leg.id);
                  return (
                    <TouchableOpacity
                      key={leg.id}
                      onPress={() => toggleDisputedLeg(leg.id)}
                      style={[styles.legOption, selected && styles.legOptionSelected]}
                    >
                      <Icon
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={17}
                        color={selected ? Colors.primary : Colors.onSurfaceMuted}
                      />
                      <Text style={styles.legOptionText} numberOfLines={1}>
                        {leg.source.label}
                      </Text>
                      <Text style={styles.legOptionAmount}>
                        ₦{leg.amountInSettlementCurrency.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {(Object.keys(DISPUTE_REASON_LABEL) as DisputeReason[]).map((reason) => (
              <TouchableOpacity
                key={reason}
                style={styles.reasonRow}
                onPress={() => submitDispute(reason)}
              >
                <Text style={styles.reasonText}>{DISPUTE_REASON_LABEL[reason]}</Text>
                <Icon name="chevron-forward" size={15} color={Colors.onSurfaceMuted} />
              </TouchableOpacity>
            ))}

            <Button
              label="Cancel"
              variant="tertiary"
              onPress={() => {
                setDisputeOpen(false);
                setDisputedLegIds([]);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * One funding leg. For a converted leg this is the only place the user can see
 * what left their account versus what reached the payee, and the rate between.
 */
function LegRow({ leg, divided }: { leg: FundingLeg; divided: boolean }) {
  const converted = leg.sourceCurrency !== leg.settlementCurrency;
  const source = leg.source;

  return (
    <View style={[styles.legRow, divided && styles.legDivided]}>
      <View style={styles.legLogo}>
        {hasCryptoLogo(source.rawCurrency) ? (
          <CryptoLogo code={source.rawCurrency} size={30} />
        ) : source.bankCode ? (
          <BankLogo code={source.bankCode} name={source.label} size={30} />
        ) : (
          <Text style={styles.legFlag}>{source.flag ?? '💳'}</Text>
        )}
      </View>

      <View style={styles.legInfo}>
        <Text style={styles.legLabel} numberOfLines={1}>
          {source.label}
        </Text>
        <Text style={styles.legMeta} numberOfLines={1}>
          {converted
            ? `${leg.amountInSourceCurrency} ${leg.sourceCurrency} · 1 ${leg.sourceCurrency} = ₦${leg.quote.rate.toLocaleString()}`
            : source.accountMask}
        </Text>
      </View>

      <View style={styles.legRight}>
        <Text style={styles.legAmount}>
          ₦{leg.amountInSettlementCurrency.toLocaleString()}
        </Text>
        {leg.feeInSettlementCurrency > 0 ? (
          <Text style={styles.legFee}>
            fee ₦{Math.round(leg.feeInSettlementCurrency).toLocaleString()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function describeLeg(leg: FundingLeg) {
  const converted = leg.sourceCurrency !== leg.settlementCurrency;
  const base = `  ₦${leg.amountInSettlementCurrency.toLocaleString()} from ${leg.source.label}`;
  return converted ? `${base} (${leg.amountInSourceCurrency} ${leg.sourceCurrency})` : base;
}

function Row({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          emphasis && styles.rowValueEmphasis,
          muted && styles.rowValueMuted,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  loading: { paddingHorizontal: Spacing.xl, gap: Spacing.xl, alignItems: 'center' },
  body: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displayMd.fontSize,
    letterSpacing: Typography.displayMd.letterSpacing,
    marginTop: Spacing.lg,
  },
  merchant: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    marginTop: Spacing.md,
  },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  datetime: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.sm,
  },

  section: { width: '100%', marginTop: Spacing.xl },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleSm.fontSize,
    color: Colors.onSurface,
    marginBottom: Spacing.sm,
  },
  sectionMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    marginBottom: Spacing.sm,
  },

  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  legDivided: {
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  legLogo: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legFlag: { fontSize: 18 },
  legInfo: { flex: 1 },
  legLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  legMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  legRight: { alignItems: 'flex-end' },
  legAmount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Colors.onSurface,
  },
  legFee: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: 2,
  },

  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    width: '100%',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  pendingText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rowLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  rowValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  rowValueEmphasis: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleSm.fontSize,
  },
  rowValueMuted: { color: Colors.onSurfaceMuted },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  refValue: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    color: Colors.primary,
  },

  actions: {
    width: '100%',
    marginTop: Spacing.xxl,
    gap: Spacing.md,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceBright,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xs,
  },
  sheetTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  sheetBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.md,
  },
  legPicker: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  legPickerLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    marginBottom: Spacing.xs,
  },
  legOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  legOptionSelected: {},
  legOptionText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  legOptionAmount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  reasonText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
});
