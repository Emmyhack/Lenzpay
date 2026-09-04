import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ExpiredScrimProps {
  message: string;
  onRefresh: () => void;
}

/**
 * Covers a plan whose authorisation has lapsed.
 *
 * There are two wrong ways to handle an expired lock and this avoids both.
 * Blanking the figures loses the user's context for the payment they were
 * about to make. Leaving them fully legible implies they are still good, when
 * the hold behind them has actually been released.
 *
 * So the numbers stay on screen and are visibly veiled — present enough to
 * remind you what you were doing, obscured enough that you would not read them
 * as live. The scrim also covers the content rather than sitting beside it,
 * which is what stops a stale amount being the thing the user is looking at
 * when they reach for the PIN pad.
 */
export function ExpiredScrim({ message, onRefresh }: ExpiredScrimProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    opacity.value = reduceMotion ? 1 : withTiming(1, { duration: 200 });
  }, [reduceMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, style]}>
      <View style={styles.inner}>
        <Icon name="time" size={20} color={Colors.warning} />
        <Text style={styles.message}>{message}</Text>
        <Pressable
          onPress={onRefresh}
          accessibilityRole="button"
          hitSlop={12}
          style={styles.action}
        >
          <Icon name="refresh" size={14} color={Colors.onPrimary} />
          <Text style={styles.actionText}>Refresh</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    // Opaque enough that the figures beneath cannot be read as live data — at
    // lower alpha the stale amounts competed with the message sitting on top
    // of them, which is worse than either showing or hiding them cleanly.
    backgroundColor: 'rgba(14,14,15,0.94)',
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  inner: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onPrimary,
  },
});
