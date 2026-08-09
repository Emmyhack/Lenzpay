import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

interface SpinningRingProps {
  size?: number;
  color?: string;
}

export function SpinningRing({ size = 64, color = Colors.primary }: SpinningRingProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1, false);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderTopColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 4,
    borderColor: Colors.surfaceContainerHigh,
  },
});
