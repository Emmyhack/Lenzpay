import { useEffect, useState } from 'react';
import { useSharedValue, withTiming, useAnimatedReaction, runOnJS, Easing } from 'react-native-reanimated';

/**
 * Animates a numeric balance counting up/down toward `value` and returns a
 * pre-formatted string on each frame — for BalanceHero and success-screen
 * amount displays. Formatting runs on the JS thread via runOnJS since
 * `toLocaleString` isn't available on the UI thread.
 */
export function useAnimatedBalance(value: number, durationMs = 700, prefix = '₦') {
  const animated = useSharedValue(value);
  const [display, setDisplay] = useState(`${prefix}${Math.round(value).toLocaleString()}`);

  useEffect(() => {
    animated.value = withTiming(value, { duration: durationMs, easing: Easing.out(Easing.cubic) });
  }, [value, durationMs, animated]);

  useAnimatedReaction(
    () => animated.value,
    (current) => {
      runOnJS(setDisplay)(`${prefix}${Math.round(current).toLocaleString()}`);
    }
  );

  return display;
}
