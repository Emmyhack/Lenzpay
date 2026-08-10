import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { LenzPayLogo } from '@/components/ui/LenzPayLogo';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const SPLASH_DURATION_MS = 1800;

/**
 * Launch screen.
 *
 * The logo settles in, and a single determinate bar shows the wait ending.
 * The previous version drew a 420×420 `borderRadius: 210` *linear* gradient —
 * a linear ramp clipped to a circle reads as a flat disc with a visible edge,
 * not the ambient bloom it was meant to be. The bloom now comes from a real
 * radial gradient inside the logo component; the disc is gone.
 */
export default function SplashScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.94);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      logoOpacity.value = 1;
      logoScale.value = 1;
      progress.value = 1;
    } else {
      logoOpacity.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
      logoScale.value = withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) });
      progress.value = withDelay(
        160,
        withTiming(1, {
          duration: SPLASH_DURATION_MS - 360,
          easing: Easing.inOut(Easing.cubic),
        })
      );
    }

    const timer = setTimeout(() => {
      router.replace('/(auth)/welcome');
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [router, reduceMotion, logoOpacity, logoScale, progress]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={logoStyle}>
        <LenzPayLogo size="xl" glow />
      </Animated.View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    bottom: 96,
    width: 132,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.outlineVariant,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
  },
});
