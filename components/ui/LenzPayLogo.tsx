import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { Colors } from '@/constants/theme';

/**
 * The LenzPay wordmark.
 *
 * Matches `assets/icon.png`: a single typeface throughout, with colour — not
 * font — carrying the Lenz / Pay split. The previous inline version mixed Inter
 * and Space Grotesk across the two halves, which read as two words from two
 * brands rather than one lockup.
 */

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

const FONT_SIZE: Record<LogoSize, number> = {
  sm: 20,
  md: 28,
  lg: 40,
  xl: 52,
};

interface LenzPayLogoProps {
  size?: LogoSize;
  /**
   * Soft radial bloom behind the wordmark. A real `RadialGradient` — the thing
   * it replaces was a *linear* gradient clipped to `borderRadius`, which
   * renders as a hard-edged disc rather than a glow.
   */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function LenzPayLogo({ size = 'md', glow = false, style }: LenzPayLogoProps) {
  const fontSize = FONT_SIZE[size];
  const glowSize = fontSize * 11;

  return (
    <View style={[styles.wrap, style]}>
      {glow ? (
        <View pointerEvents="none" style={[styles.glowLayer, { width: glowSize, height: glowSize }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="lenzGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={Colors.primary} stopOpacity={0.18} />
                <Stop offset="45%" stopColor={Colors.primary} stopOpacity={0.07} />
                <Stop offset="100%" stopColor={Colors.primary} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#lenzGlow)" />
          </Svg>
        </View>
      ) : null}

      <View style={styles.wordmark} accessibilityRole="image" accessibilityLabel="Lenz Pay">
        <Text style={[styles.word, { fontSize }]}>Lenz</Text>
        <Text style={[styles.word, styles.accent, { fontSize }]}>Pay</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    flexDirection: 'row',
  },
  word: {
    fontFamily: 'Inter_600SemiBold',
    color: Colors.onSurface,
    letterSpacing: -0.5,
  },
  accent: {
    color: Colors.primary,
  },
});
