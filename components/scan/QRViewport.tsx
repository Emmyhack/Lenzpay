import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface QRViewportProps {
  onScanned: (result: BarcodeScanningResult) => void;
  active?: boolean;
  torchOn?: boolean;
}

const FRAME_SIZE = 260;
const BRACKET_LEN = 32;
const BRACKET_THICKNESS = 4;

function CornerBracket({ style }: { style: object }) {
  return (
    <Svg width={BRACKET_LEN} height={BRACKET_LEN} style={style}>
      <Path
        d={`M0,${BRACKET_LEN} L0,0 L${BRACKET_LEN},0`}
        stroke={Colors.primary}
        strokeWidth={BRACKET_THICKNESS}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function QRViewport({ onScanned, active = true, torchOn = false }: QRViewportProps) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const sweepY = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    sweepY.value = withRepeat(withTiming(FRAME_SIZE, { duration: 1800, easing: Easing.linear }), -1, false);
  }, [reducedMotion, sweepY]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweepY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={active}
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={active ? onScanned : undefined}
      />

      <View style={styles.overlay} pointerEvents="none">
        <View style={[styles.frame, { left: (width - FRAME_SIZE) / 2 }]}>
          <CornerBracket style={styles.topLeft} />
          <CornerBracket style={[styles.topRight, { transform: [{ rotate: '90deg' }] }]} />
          <CornerBracket style={[styles.bottomRight, { transform: [{ rotate: '180deg' }] }]} />
          <CornerBracket style={[styles.bottomLeft, { transform: [{ rotate: '270deg' }] }]} />
          {!reducedMotion && <Animated.View style={[styles.sweepLine, sweepStyle]} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  topLeft: { position: 'absolute', top: 0, left: 0 },
  topRight: { position: 'absolute', top: 0, right: 0 },
  bottomRight: { position: 'absolute', bottom: 0, right: 0 },
  bottomLeft: { position: 'absolute', bottom: 0, left: 0 },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
});
