import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';

interface Slide {
  key: string;
  headline: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    key: 'any-account',
    headline: 'Pay from any account',
    body: 'Bank, wallet, USD, or crypto — Lenz Pay picks the right source automatically.',
  },
  {
    key: 'smart-split',
    headline: 'Never fall short',
    body: "If one account can't cover it, we split the payment across the ones that can.",
  },
  {
    key: 'rewards',
    headline: 'Earn on every payment',
    body: 'Points and cashback rack up automatically, no matter which source you pay from.',
  },
];

function FloatInIcon({ icon, delay }: { icon: IconName; delay: number }) {
  const translateY = useSharedValue(24);
  const opacity = useSharedValue(0);
  translateY.value = withDelay(delay, withSpring(0, { damping: 12 }));
  opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[artStyles.iconBubble, style]}>
      <Icon name={icon} size={24} color={Colors.onSurface} />
    </Animated.View>
  );
}

function SourceIconsArt() {
  return (
    <View style={artStyles.row}>
      <View style={artStyles.iconsRow}>
        <FloatInIcon icon="business-outline" delay={0} />
        <FloatInIcon icon="cash" delay={150} />
        <FloatInIcon icon="logo-bitcoin" delay={300} />
      </View>
      <Icon name="arrow-down" size={20} color={Colors.onSurfaceMuted} style={artStyles.arrow} />
      <View style={artStyles.targetBubble}>
        <Icon name="checkmark" size={24} color={Colors.primary} />
      </View>
    </View>
  );
}

function SplitBar({ targetPercent, delay, color }: { targetPercent: number; delay: number; color: string }) {
  const width = useSharedValue(0);
  width.value = withDelay(delay, withTiming(targetPercent, { duration: 700, easing: Easing.out(Easing.cubic) }));
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={artStyles.barTrack}>
      <Animated.View style={[artStyles.barFill, style, { backgroundColor: color }]} />
    </View>
  );
}

function SplitBarsArt() {
  return (
    <View style={artStyles.barsWrap}>
      <SplitBar targetPercent={70} delay={0} color={Colors.primary} />
      <SplitBar targetPercent={30} delay={200} color={Colors.warning} />
    </View>
  );
}

function PointsCounterArt() {
  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);
  progress.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  pulse.value = withDelay(900, withRepeat(withTiming(1.04, { duration: 600 }), -1, true));

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 72}%` }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={artStyles.pointsWrap}>
      <Animated.View style={[artStyles.tierBadge, badgeStyle, artStyles.tierBadgeRow]}>
        <Icon name="star" size={14} color={Colors.warning} />
        <Text style={artStyles.tierText}>Gold · 3,240 pts</Text>
      </Animated.View>
      <View style={artStyles.barTrack}>
        <Animated.View style={[artStyles.barFill, barStyle, { backgroundColor: Colors.primary }]} />
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIndex(index);
    },
    [width]
  );

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1 });
    } else {
      router.replace('/(auth)/signup');
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.skip, { top: insets.top + Spacing.md }]}
        onPress={() => router.replace('/(auth)/signup')}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item, index }) => (
          <View style={[styles.slide, { width, paddingTop: insets.top + Spacing.xxxl }]}>
            <View style={styles.art}>
              {index === 0 && <SourceIconsArt />}
              {index === 1 && <SplitBarsArt />}
              {index === 2 && <PointsCounterArt />}
            </View>
            <Text style={styles.headline}>{item.headline}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (
            <View key={slide.key} style={[styles.pageDot, i === activeIndex && styles.pageDotActive]} />
          ))}
        </View>
        <Button label={isLast ? 'Get Started' : 'Next'} trailingArrow onPress={goNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skip: {
    position: 'absolute',
    top: Spacing.xxl,
    right: Spacing.xl,
    zIndex: 10,
    padding: Spacing.sm,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  list: {
    flex: 1,
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    // paddingTop is applied inline per-slide with the safe-area inset added.
  },
  art: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  headline: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displaySm.fontSize,
    lineHeight: Typography.displaySm.lineHeight,
    letterSpacing: Typography.displaySm.letterSpacing,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.outlineVariant,
  },
  pageDotActive: {
    backgroundColor: Colors.primary,
    width: 18,
  },
});

const artStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
  },
  iconsRow: {
    flexDirection: 'row',
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.xs,
  },
  arrow: {
    marginVertical: Spacing.sm,
  },
  targetBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + '20',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsWrap: {
    width: 220,
    gap: Spacing.md,
  },
  pointsWrap: {
    width: 220,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  tierBadge: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  tierBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tierText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
  },
  barTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
});
