import React, { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

const THUMB_SIZE = 24;

interface SliderProps {
  value: number; // 0..1
  onChange: (value: number) => void;
}

export function Slider({ value, onChange }: SliderProps) {
  const [travel, setTravel] = useState(0); // trackWidth - THUMB_SIZE — the thumb's actual movable range
  const position = useSharedValue(0); // thumb's left-edge offset, 0..travel
  const startPosition = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    const nextTravel = Math.max(0, e.nativeEvent.layout.width - THUMB_SIZE);
    setTravel(nextTravel);
    position.value = value * nextTravel;
  };

  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);

  const emitChange = (ratio: number) => onChange(ratio);

  const pan = Gesture.Pan()
    .onStart(() => {
      startPosition.value = position.value;
    })
    .onUpdate((e) => {
      const next = clamp(startPosition.value + e.translationX, travel);
      position.value = next;
      runOnJS(emitChange)(travel > 0 ? next / travel : 0);
    })
    .onEnd(() => {
      position.value = withSpring(position.value, { damping: 20, stiffness: 300 });
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const next = clamp(e.x - THUMB_SIZE / 2, travel);
    position.value = withSpring(next, { damping: 20, stiffness: 300 });
    runOnJS(emitChange)(travel > 0 ? next / travel : 0);
  });

  const gesture = Gesture.Race(pan, tap);

  const fillStyle = useAnimatedStyle(() => ({ width: position.value + THUMB_SIZE / 2 }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.track} onLayout={handleLayout}>
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.surfaceContainerHigh,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
