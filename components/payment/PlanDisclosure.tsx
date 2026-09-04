import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { FundingPlan, LockedPlan } from '@/types/orchestration';
import { formatRateLine } from '@/services/orchestration';

interface PlanDisclosureProps {
  /**
   * Accepts a prepared plan as well as a raw one. Once prepared, `expiresAt`
   * is the earlier of the rate lock and any authorisation placed — so the
   * countdown becomes a real deadline for the payment, not just the rate.
   */
  plan: FundingPlan | LockedPlan;
}

/**
 * Pre-confirmation disclosure (§5.5).
 *
 * Every conversion the engine is about to perform is shown here — which
 * account, at what rate, for what fee — before the user authorises anything.
 * The countdown makes the rate lock visible rather than an invisible deadline
 * the user discovers only when the payment re-prompts them.
 */
const URGENT_BELOW_S = 10;

export function PlanDisclosure({ plan }: PlanDisclosureProps) {
  const secondsLeft = useCountdown(plan.expiresAt);
  const reduceMotion = useReducedMotion();
  const converting = plan.legs.filter((leg) => leg.sourceCurrency !== leg.settlementCurrency);

  // A hold that is about to lapse is a real deadline with a real cost — the
  // authorisation is released and the user has to start again. Colour alone is
  // easy to miss on a screen someone is only half looking at, so the last ten
  // seconds pulse. It stops at zero rather than pulsing at an expired lock.
  const urgency = useSharedValue(1);
  const isUrgent = secondsLeft !== null && secondsLeft > 0 && secondsLeft <= URGENT_BELOW_S;

  useEffect(() => {
    if (!isUrgent || reduceMotion) {
      cancelAnimation(urgency);
      urgency.value = 1;
      return;
    }
    urgency.value = withRepeat(
      withTiming(0.35, { duration: 550, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(urgency);
  }, [isUrgent, reduceMotion, urgency]);

  const urgencyStyle = useAnimatedStyle(() => ({ opacity: urgency.value }));

  // A single same-currency leg with no deadline has nothing to disclose.
  if (converting.length === 0 && plan.legs.length <= 1 && plan.expiresAt === null) return null;

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
        <Animated.View style={[styles.lockRow, urgencyStyle]}>
          <Icon
            name={secondsLeft > URGENT_BELOW_S ? 'lock-closed' : 'time'}
            size={12}
            color={secondsLeft > URGENT_BELOW_S ? Colors.onSurfaceMuted : Colors.warning}
          />
          <Text style={[styles.lockText, secondsLeft <= URGENT_BELOW_S && styles.lockTextUrgent]}>
            {secondsLeft > 0
              ? `${converting.length > 0 ? 'Rate' : 'Funds'} held for ${secondsLeft}s`
              : 'Expired — we’ll re-check before sending'}
          </Text>
        </Animated.View>
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
