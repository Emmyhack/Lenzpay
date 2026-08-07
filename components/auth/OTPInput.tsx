import React, { useRef, useState, useEffect } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface OTPInputProps {
  length?: number;
  onComplete: (code: string) => void;
  error?: boolean;
}

export function OTPInput({ length = 6, onComplete, error = false }: OTPInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const inputs = useRef<Array<TextInput | null>>([]);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (error) {
      shakeX.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-8, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
    }
  }, [error, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleChange = (text: string, index: number) => {
    // Support pasting the full code into any box.
    if (text.length > 1) {
      const pasted = text.slice(0, length).split('');
      const next = [...digits];
      pasted.forEach((d, i) => {
        if (index + i < length) next[index + i] = d;
      });
      setDigits(next);
      const joined = next.join('');
      if (joined.length === length) onComplete(joined);
      else inputs.current[Math.min(index + pasted.length, length - 1)]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = text;
    setDigits(next);

    if (text && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }

    const joined = next.join('');
    if (joined.length === length && next.every((d) => d !== '')) {
      onComplete(joined);
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <Animated.View style={[styles.row, shakeStyle]}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          style={[styles.box, digits[i] && styles.boxFilled, error && styles.boxError]}
          value={digits[i]}
          onChangeText={(text) => handleChange(text, i)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
          keyboardType="number-pad"
          maxLength={length} // allows paste-into-any-box
          textAlign="center"
          accessibilityLabel={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  box: {
    width: 52,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHighest,
    color: Colors.onSurface,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 24,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  boxFilled: {
    borderColor: Colors.primary,
  },
  boxError: {
    borderColor: Colors.error,
  },
});
