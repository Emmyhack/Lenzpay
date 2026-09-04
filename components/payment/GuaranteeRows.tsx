import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { GuaranteeKind, PreparedLeg } from '@/types/orchestration';

interface GuaranteeRowsProps {
  legs: PreparedLeg[];
  currency?: string;
}

/**
 * Per-account backing, shown before the user authorises (§5.4, ADR-013).
 *
 * Once a plan is prepared the engine knows something genuinely new and
 * genuinely user-relevant: which of their accounts is *actually committed*,
 * and which is merely expected to pay. That difference decides who carries the
 * risk if a debit later fails — the user, or Lenz.
 *
 * Showing it is a fairness matter, not a detail. "Held on your card" and
 * "Covered by Lenz" are different promises, and a user splitting a payment
 * across three accounts is entitled to know which is which before they commit.
 */

interface Presentation {
  label: string;
  detail: string;
  icon: IconName;
  color: string;
}

const PRESENTATION: Record<GuaranteeKind, Presentation> = {
  RESERVED: {
    label: 'Reserved',
    detail: 'Set aside for this payment',
    icon: 'lock-closed',
    color: Colors.success,
  },
  PREAUTHORIZED: {
    label: 'Held',
    detail: 'Authorised on your card',
    icon: 'lock-closed',
    color: Colors.success,
  },
  SIGNED: {
    label: 'Approved',
    detail: 'Ready to send on-chain',
    icon: 'checkmark-circle',
    color: Colors.secondary,
  },
  // Deliberately not dressed up as a weaker version of "held". The money is
  // still in the user's account and can still move; Lenz is carrying that risk,
  // and saying so plainly is the honest description.
  FLOAT_BACKED: {
    label: 'Covered by Lenz',
    detail: 'We pay now and collect after',
    icon: 'shield-checkmark',
    color: Colors.onSurfaceVariant,
  },
};

export function guaranteePresentation(guarantee: GuaranteeKind): Presentation {
  return PRESENTATION[guarantee];
}

/**
 * The same four guarantees described as *capabilities* rather than as facts.
 *
 * On the confirmation screen "Held" is accurate: a hold exists. On a source
 * detail screen nothing is held — the card is merely capable of being held —
 * so the present tense would be a lie about the state of the user's money.
 * Same concept, different tense, and the distinction matters enough to be two
 * tables rather than one with a flag.
 */
const CAPABILITY: Record<GuaranteeKind, Presentation> = {
  RESERVED: {
    label: 'Can be reserved',
    detail: 'We can set funds aside before paying',
    icon: 'lock-closed',
    color: Colors.success,
  },
  PREAUTHORIZED: {
    label: 'Can be held',
    detail: 'We authorise funds before taking them',
    icon: 'lock-closed',
    color: Colors.success,
  },
  SIGNED: {
    label: 'Needs approval',
    detail: 'You approve each transfer',
    icon: 'checkmark-circle',
    color: Colors.secondary,
  },
  FLOAT_BACKED: {
    label: 'Covered by Lenz',
    detail: 'This rail can’t hold funds, so we cover it',
    icon: 'shield-checkmark',
    color: Colors.onSurfaceVariant,
  },
};

export function capabilityPresentation(guarantee: GuaranteeKind): Presentation {
  return CAPABILITY[guarantee];
}

export function GuaranteeRows({ legs, currency = '₦' }: GuaranteeRowsProps) {
  const reduceMotion = useReducedMotion();

  if (legs.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {legs.map((leg, index) => (
        <GuaranteeRow
          key={leg.id}
          leg={leg}
          currency={currency}
          index={index}
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  );
}

/**
 * One account's contribution, revealed in turn.
 *
 * The stagger is not decoration. `prepare()` authorises legs sequentially —
 * hold this card, reserve that custody balance, verify the bank — and
 * revealing them in the same order shows work that genuinely happened rather
 * than a list appearing fully formed. It also gives the user a beat to read
 * each guarantee instead of meeting three at once.
 */
const STAGGER_MS = 70;

function GuaranteeRow({
  leg,
  currency,
  index,
  reduceMotion,
}: {
  leg: PreparedLeg;
  currency: string;
  index: number;
  reduceMotion: boolean;
}) {
  const presentation = PRESENTATION[leg.guarantee];
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 6);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = index * STAGGER_MS;
    opacity.value = withDelay(delay, withTiming(1, { duration: 220 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 220 }));
  }, [index, reduceMotion, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.row, style]}>
      <View style={styles.identity}>
        <Text style={styles.source} numberOfLines={1}>
          {leg.source.label}
        </Text>
        <Text style={styles.mask}>{leg.source.accountMask}</Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.amount}>
          {currency}
          {Math.round(leg.amountInSettlementCurrency).toLocaleString()}
        </Text>
        <View style={styles.guarantee}>
          <Icon name={presentation.icon} size={11} color={presentation.color} />
          <Text style={[styles.guaranteeText, { color: presentation.color }]}>
            {presentation.label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  identity: {
    flexShrink: 1,
    gap: 2,
  },
  source: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  mask: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
  },
  right: {
    alignItems: 'flex-end',
    gap: 3,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  guarantee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guaranteeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
});
