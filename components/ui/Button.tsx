import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Radius, Elevation } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

interface ButtonProps {
  label: string;
  variant?: Variant;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  /** Leading icon — replaces the old inline emoji-prefix convention (e.g. "⚡ Default"). */
  icon?: IconName;
  /** Appends a trailing forward-arrow icon — the vector replacement for the
   * old inline "→" copy convention used on most CTA buttons. */
  trailingArrow?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function Button({
  label,
  variant = 'primary',
  onPress,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  icon,
  trailingArrow = false,
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  if (variant === 'primary') {
    return (
      <Animated.View style={[animatedStyle, fullWidth && styles.fullWidth, style]}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          style={styles.base}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <LinearGradient
            colors={
              disabled
                ? [Colors.surfaceContainerHigh, Colors.surfaceContainerHighest]
                : ['#34fea0', '#0cef93']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.primaryGradient, !disabled && Elevation.primaryGlow]}
          >
            {loading ? (
              <ActivityIndicator color={Colors.onPrimary} />
            ) : (
              <View style={styles.labelRow}>
                {icon ? (
                  <Icon name={icon} size={16} color={disabled ? Colors.onSurfaceMuted : Colors.onPrimary} />
                ) : null}
                <Text style={[styles.primaryText, disabled && styles.disabledText]} numberOfLines={1} adjustsFontSizeToFit>
                  {label}
                </Text>
                {trailingArrow ? (
                  <Icon name="arrow-forward" size={16} color={disabled ? Colors.onSurfaceMuted : Colors.onPrimary} />
                ) : null}
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <AnimatedTouchable
      style={[
        animatedStyle,
        styles.base,
        styles[variant],
        fullWidth && styles.fullWidth,
        disabled && styles.disabledOpacity,
        style,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'tertiary' ? Colors.secondary : Colors.onSurface} />
      ) : (
        <View style={styles.labelRow}>
          {icon ? (
            <Icon
              name={icon}
              size={16}
              color={(styles[`${variant}Text` as keyof typeof styles] as TextStyle)?.color as string}
            />
          ) : null}
          <Text
            style={[styles.text, styles[`${variant}Text` as keyof typeof styles] as TextStyle]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </Text>
          {trailingArrow ? (
            <Icon
              name="arrow-forward"
              size={16}
              color={(styles[`${variant}Text` as keyof typeof styles] as TextStyle)?.color as string}
            />
          ) : null}
        </View>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: { width: '100%' },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryGradient: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  primaryText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: Colors.onPrimary,
    letterSpacing: 0.2,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  tertiary: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: undefined,
  },
  destructive: {
    backgroundColor: Colors.errorContainer,
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  text: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: Colors.onSurface,
  },
  secondaryText: { color: Colors.primary },
  tertiaryText: { color: Colors.secondary },
  destructiveText: { color: Colors.error },
  disabledOpacity: { opacity: 0.4 },
  disabledText: { color: Colors.onSurfaceMuted },
});
