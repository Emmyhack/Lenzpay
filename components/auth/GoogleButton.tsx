import { ActivityIndicator, Pressable, Text, View, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';

interface GoogleButtonProps {
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * "Continue with Google".
 *
 * Rendered on a light surface with Google's own wordmark colour rather than
 * the app's mint, because this button is not a LenzPay action — it hands the
 * user to a third party, and dressing it in our brand would misrepresent
 * whose sheet is about to open. It is also visually subordinate to the primary
 * CTA: Google is a shortcut into the form, not the way to finish signing up.
 */
export function GoogleButton({
  label = 'Continue with Google',
  loading = false,
  disabled = false,
  onPress,
}: GoogleButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        pressed && !inactive && styles.pressed,
        inactive && styles.inactive,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={Colors.background} />
        ) : (
          <Icon name="logo-google" size={18} color="#4285F4" />
        )}
        <Text style={styles.label}>{loading ? 'Connecting…' : label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  inactive: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    // Google's guidance is dark text on the white button, not a brand colour.
    color: '#1f1f1f',
  },
});
