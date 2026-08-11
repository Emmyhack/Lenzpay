import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type ScanStatus = 'idle' | 'resolving' | 'error';

interface QRViewportProps {
  onScanned: (result: BarcodeScanningResult) => void;
  /**
   * Camera session on/off. Driven by screen focus only — deactivating it to
   * stop a scan would blank the preview, so arming is a separate concern.
   */
  active?: boolean;
  /** Whether a detected code should be acted on. */
  scanning?: boolean;
  torchOn?: boolean;
  status?: ScanStatus;
  /** Guidance under the reticle. Carries the error text when status is error. */
  hint?: string;
  /** Space consumed by the top bar; the reticle stays clear of it. */
  topInset?: number;
  /** Measured height of the action sheet, so the hint is never hidden by it. */
  bottomInset?: number;
}

const CORNER = 34;
const STROKE = 4;
/** Shared by the mask cutout and the bracket arcs, so both trace one curve. */
const FRAME_RADIUS = Radius.xl;
/** Room reserved below the reticle for the hint line. */
const HINT_SPACE = 52;
const MAX_FRAME = 290;

const STATUS_COLOR: Record<ScanStatus, string> = {
  idle: Colors.primary,
  resolving: Colors.primary,
  error: Colors.error,
};

/**
 * Camera viewport with an aiming reticle.
 *
 * The important part is the **mask**: everything outside the reticle is dimmed
 * with a single even-odd SVG path. Without it the brackets were four marks
 * floating on a full-brightness feed and nothing drew the eye to the aim area
 * — which is the one job this screen has.
 *
 * The reticle sits above centre so the action sheet at the bottom never covers
 * the thing the user is aiming.
 */
export function QRViewport({
  onScanned,
  active = true,
  scanning = true,
  torchOn = false,
  status = 'idle',
  hint,
  topInset = 0,
  bottomInset = 0,
}: QRViewportProps) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  /**
   * The reticle is centred in the band left between the top bar and the action
   * sheet, and shrinks to fit it — not placed at a fixed fraction of the
   * screen. A fixed ratio put the hint line behind the sheet on a 568pt
   * device, which is exactly where the error messages appear.
   */
  const frame = useMemo(() => {
    const bandTop = topInset;
    const bandHeight = Math.max(160, height - topInset - bottomInset);
    const size = Math.max(
      150,
      Math.min(width * 0.7, MAX_FRAME, bandHeight - HINT_SPACE - Spacing.xl * 2)
    );

    return {
      size,
      x: (width - size) / 2,
      y: bandTop + Math.max(Spacing.lg, (bandHeight - size - HINT_SPACE) / 2),
    };
  }, [width, height, topInset, bottomInset]);

  const accent = STATUS_COLOR[status];

  // ---- Sweep: only while genuinely waiting for a code --------------------
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || status !== 'idle') {
      sweep.value = 0;
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [reducedMotion, status, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (frame.size - STROKE) }],
    opacity: status === 'idle' ? 0.9 : 0,
  }));

  // ---- Pulse: acknowledges that a code was seen --------------------------
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (status === 'idle') {
      pulse.value = 0;
      return;
    }
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 420 }), withTiming(0.35, { duration: 420 })),
      status === 'resolving' ? -1 : 2,
      true
    );
  }, [status, reducedMotion, pulse]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value * 0.5 }));

  /**
   * One path: the whole screen, then the reticle as a reversed sub-path.
   * `evenodd` punches the hole, so the dim is a single node rather than four
   * rectangles that never quite meet at the corners.
   */
  const maskPath = useMemo(() => {
    const { x, y, size } = frame;
    const r = FRAME_RADIUS;
    const outer = `M0,0 H${width} V${height} H0 Z`;
    const inner =
      `M${x + r},${y} ` +
      `H${x + size - r} A${r},${r} 0 0 1 ${x + size},${y + r} ` +
      `V${y + size - r} A${r},${r} 0 0 1 ${x + size - r},${y + size} ` +
      `H${x + r} A${r},${r} 0 0 1 ${x},${y + size - r} ` +
      `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
    return `${outer} ${inner}`;
  }, [frame, width, height]);

  const bracket = (dx: number, dy: number, rotate: string) => (
    <View
      style={[
        styles.bracket,
        { left: frame.x + dx, top: frame.y + dy, transform: [{ rotate }] },
      ]}
      pointerEvents="none"
    >
      <Svg width={CORNER} height={CORNER}>
        <Path
          d={`M${STROKE / 2},${CORNER} L${STROKE / 2},${FRAME_RADIUS} A${FRAME_RADIUS},${FRAME_RADIUS} 0 0 1 ${FRAME_RADIUS},${STROKE / 2} L${CORNER},${STROKE / 2}`}
          stroke={accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={active}
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={active && scanning ? onScanned : undefined}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={height}>
          <Path d={maskPath} fill="rgba(0,0,0,0.62)" fillRule="evenodd" />
        </Svg>
      </View>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Fills the reticle while resolving, so "seen it, working on it" is
            visible without hiding the code itself. */}
        <Animated.View
          style={[
            styles.glow,
            {
              left: frame.x,
              top: frame.y,
              width: frame.size,
              height: frame.size,
              backgroundColor: accent,
            },
            glowStyle,
          ]}
        />

        <View
          style={[
            styles.sweepClip,
            { left: frame.x, top: frame.y, width: frame.size, height: frame.size },
          ]}
        >
          <Animated.View style={[styles.sweepLine, { backgroundColor: accent }, sweepStyle]} />
        </View>

        {bracket(0, 0, '0deg')}
        {bracket(frame.size - CORNER, 0, '90deg')}
        {bracket(frame.size - CORNER, frame.size - CORNER, '180deg')}
        {bracket(0, frame.size - CORNER, '270deg')}

        {hint ? (
          <Text
            style={[
              styles.hint,
              { top: frame.y + frame.size + Spacing.xl, width },
              status === 'error' && styles.hintError,
            ]}
          >
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    borderRadius: FRAME_RADIUS,
  },
  sweepClip: {
    position: 'absolute',
    borderRadius: FRAME_RADIUS,
    overflow: 'hidden',
  },
  sweepLine: {
    height: STROKE,
    borderRadius: STROKE,
    marginHorizontal: Spacing.md,
  },
  bracket: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
  },
  hint: {
    position: 'absolute',
    textAlign: 'center',
    paddingHorizontal: Spacing.xxl,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: 'rgba(255,255,255,0.75)',
  },
  hintError: {
    color: Colors.error,
    fontFamily: 'Inter_600SemiBold',
  },
});
