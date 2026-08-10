import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import type { FundingPlan } from '@/types/orchestration';
import { formatRateLine } from '@/services/orchestration';

interface PlanDisclosureProps {
  plan: FundingPlan;
}

/**
 * Pre-confirmation disclosure (§5.5).
 *
 * Every conversion the engine is about to perform is shown here — which
 * account, at what rate, for what fee — before the user authorises anything.
 * The countdown makes the rate lock visible rather than an invisible deadline
 * the user discovers only when the payment re-prompts them.
 */
export function PlanDisclosure({ plan }: PlanDisclosureProps) {
  const secondsLeft = useCountdown(plan.expiresAt);
  const converting = plan.legs.filter((leg) => leg.sourceCurrency !== leg.settlementCurrency);

  if (converting.length === 0 && plan.legs.length <= 1) return null;

  return (
    <View style={styles.wrap}>
      {plan.legs.length > 1 ? (
        <View style={styles.row}>
          <Text style={styles.label}>Funding</Text>
          <Text style={styles.value}>{plan.legs.length} sources</Text>
        </View>
      ) : null}

      {converting.map((leg) => (
        <View key={leg.id} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {leg.source.label}
          </Text>
          <Text style={styles.value}>
            {leg.amountInSourceCurrency} {leg.sourceCurrency} · {formatRateLine(leg.quote)}
          </Text>
        </View>
      ))}

      {plan.totalFees > 0 ? (
        <View style={styles.row}>
          <Text style={styles.label}>Conversion cost</Text>
          <Text style={styles.value}>₦{Math.round(plan.totalFees).toLocaleString()}</Text>
        </View>
      ) : null}

      {secondsLeft !== null ? (
        <View style={styles.lockRow}>
          <Icon
            name={secondsLeft > 10 ? 'lock-closed' : 'time'}
            size={12}
            color={secondsLeft > 10 ? Colors.onSurfaceMuted : Colors.warning}
          />
          <Text style={[styles.lockText, secondsLeft <= 10 && styles.lockTextUrgent]}>
            {secondsLeft > 0
              ? `Rate held for ${secondsLeft}s`
              : 'Rate expired — we’ll re-check before sending'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Ticks once a second while a rate lock is live. Null when there's nothing to lock. */
function useCountdown(expiresAt: number | null): number | null {
  const [secondsLeft, setSecondsLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    if (expiresAt === null) return;
    setSecondsLeft(remaining(expiresAt));

    const timer = setInterval(() => {
      const next = remaining(expiresAt);
      setSecondsLeft(next);
      if (next !== null && next <= 0) clearInterval(timer);
    }, 1_000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  return secondsLeft;
}

function remaining(expiresAt: number | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000));
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  label: {
    flexShrink: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  value: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  lockText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
  },
  lockTextUrgent: {
    color: Colors.warning,
  },
});
