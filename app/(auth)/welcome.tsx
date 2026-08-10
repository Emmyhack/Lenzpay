import { useCallback, useEffect, useRef, useState } from 'react';
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
  Easing,
} from 'react-native-reanimated';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LenzPayLogo } from '@/components/ui/LenzPayLogo';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Slide {
  key: string;
  eyebrow: string;
  headline: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    key: 'any-account',
    eyebrow: 'One identity',
    headline: 'Pay from any account',
    body: 'Bank, wallet, USD, or crypto — Lenz Pay picks the right source automatically.',
  },
  {
    key: 'smart-split',
    eyebrow: 'Smart funding',
    headline: 'Never fall short',
    body: "If one account can't cover it, we split the payment across the ones that can.",
  },
  {
    key: 'rewards',
    eyebrow: 'Always earning',
    headline: 'Rewards on every payment',
    body: 'Points and cashback rack up automatically, no matter which source you pay from.',
  },
];

/**
 * Slide artwork animates when its slide becomes *visible*, not at mount.
 *
 * Previously every art block started animating as soon as the list rendered,
 * so slides 2 and 3 played out off-screen and were already static by the time
 * you swiped to them. Each block now takes an `active` flag and resets when it
 * scrolls away, so the motion actually lands.
 */
interface ArtProps {
  active: boolean;
  reduceMotion: boolean;
}

function FloatInIcon({ icon, delay, active, reduceMotion }: ArtProps & { icon: IconName; delay: number }) {
  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      translateY.value = 0;
      opacity.value = active ? 1 : 0;
      return;
    }
    if (active) {
      translateY.value = withDelay(delay, withSpring(0, { damping: 13 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 380 }));
    } else {
      translateY.value = 20;
      opacity.value = 0;
    }
  }, [active, delay, reduceMotion, translateY, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[artStyles.iconBubble, style]}>
      <Icon name={icon} size={22} color={Colors.onSurface} />
    </Animated.View>
  );
}

function SourceIconsArt({ active, reduceMotion }: ArtProps) {
  return (
    <View style={artStyles.column}>
      <View style={artStyles.iconsRow}>
        <FloatInIcon icon="business-outline" delay={0} active={active} reduceMotion={reduceMotion} />
        <FloatInIcon icon="cash" delay={110} active={active} reduceMotion={reduceMotion} />
        <FloatInIcon icon="logo-bitcoin" delay={220} active={active} reduceMotion={reduceMotion} />
      </View>
      <Icon name="arrow-down" size={18} color={Colors.onSurfaceMuted} style={artStyles.arrow} />
      <View style={artStyles.targetBubble}>
        <Icon name="checkmark" size={22} color={Colors.primary} />
      </View>
    </View>
  );
}

function SplitBar({
  targetPercent,
  delay,
  color,
  label,
  active,
  reduceMotion,
}: ArtProps & { targetPercent: number; delay: number; color: string; label: string }) {
  const width = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      width.value = active ? targetPercent : 0;
      return;
    }
    width.value = active
      ? withDelay(delay, withTiming(targetPercent, { duration: 620, easing: Easing.out(Easing.cubic) }))
      : 0;
  }, [active, delay, targetPercent, reduceMotion, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={artStyles.barRow}>
      <Text style={artStyles.barLabel}>{label}</Text>
      <View style={artStyles.barTrack}>
        <Animated.View style={[artStyles.barFill, style, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SplitBarsArt({ active, reduceMotion }: ArtProps) {
  return (
    <View style={artStyles.barsWrap}>
      <SplitBar
        label="GTBank"
        targetPercent={68}
        delay={0}
        color={Colors.primary}
        active={active}
        reduceMotion={reduceMotion}
      />
      <SplitBar
        label="USD"
        targetPercent={32}
        delay={160}
        color={Colors.usd}
        active={active}
        reduceMotion={reduceMotion}
      />
      <Text style={artStyles.barCaption}>₦4,500 across 2 sources</Text>
    </View>
  );
}

function PointsCounterArt({ active, reduceMotion }: ArtProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = active ? 1 : 0;
      return;
    }
    progress.value = active
      ? withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
      : 0;
  }, [active, reduceMotion, progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 72}%` }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  return (
    <View style={artStyles.pointsWrap}>
      <Animated.View style={[artStyles.tierBadge, badgeStyle]}>
        <Icon name="star" size={13} color={Colors.warning} />
        <Text style={artStyles.tierText}>Gold · 3,240 pts</Text>
      </Animated.View>
      <View style={artStyles.barTrack}>
        <Animated.View style={[artStyles.barFill, barStyle, { backgroundColor: Colors.primary }]} />
      </View>
      <Text style={artStyles.barCaption}>760 pts to Platinum</Text>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / width));
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
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.md }]}>
        <LenzPayLogo size="sm" />
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/signup')}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item, index }) => {
          const active = index === activeIndex;
          return (
            <View style={[styles.slide, { width }]}>
              <View style={styles.art}>
                {index === 0 && <SourceIconsArt active={active} reduceMotion={reduceMotion} />}
                {index === 1 && <SplitBarsArt active={active} reduceMotion={reduceMotion} />}
                {index === 2 && <PointsCounterArt active={active} reduceMotion={reduceMotion} />}
              </View>
              <Text style={styles.eyebrow}>{item.eyebrow}</Text>
              <Text style={styles.headline}>{item.headline}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (
            <View key={slide.key} style={[styles.pageDot, i === activeIndex && styles.pageDotActive]} />
          ))}
        </View>
        <Button label={isLast ? 'Get Started' : 'Continue'} trailingArrow onPress={goNext} />
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/signup')}
          style={styles.signIn}
          hitSlop={8}
        >
          <Text style={styles.signInText}>
            Already have an account? <Text style={styles.signInAccent}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  list: { flex: 1 },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  art: {
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  eyebrow: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
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
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.md,
    maxWidth: 320,
  },
  footer: { paddingHorizontal: Spacing.xl },
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
  pageDotActive: { backgroundColor: Colors.primary, width: 18 },
  signIn: { alignSelf: 'center', paddingVertical: Spacing.md, marginTop: Spacing.xs },
  signInText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  signInAccent: { fontFamily: 'Inter_600SemiBold', color: Colors.primary },
});

const artStyles = StyleSheet.create({
  column: { alignItems: 'center' },
  iconsRow: { flexDirection: 'row', gap: Spacing.sm },
  iconBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { marginVertical: Spacing.md },
  targetBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.primary + '20',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsWrap: { width: 240, gap: Spacing.md },
  barRow: { gap: Spacing.xs },
  barLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  barCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  pointsWrap: { width: 240, alignItems: 'center', gap: Spacing.lg },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  tierText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.warning,
  },
  barTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5 },
});
