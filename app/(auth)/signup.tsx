import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';

const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name')
    .refine((v) => v.trim().includes(' '), 'Enter your first and last name'),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter a valid 10-digit number'),
  referralCode: z.string().trim().optional(),
});

type SignupForm = z.infer<typeof signupSchema>;

export default function SignupScreen() {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', phone: '', referralCode: '' },
    mode: 'onBlur',
  });

  const onSubmit = async (values: SignupForm) => {
    // Replace with services/auth.ts once a real signup endpoint exists.
    await new Promise((r) => setTimeout(r, 400));
    router.push({ pathname: '/(auth)/otp', params: { phone: values.phone } });
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScreenHeader title="Create Account" />

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="fullName"
          render={({ field: { value, onChange, onBlur } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Ada Okafor"
                placeholderTextColor={Colors.onSurfaceMuted}
                style={[styles.input, errors.fullName && styles.inputError]}
                autoCapitalize="words"
                accessibilityLabel="Full name"
              />
              {errors.fullName ? <Text style={styles.errorText}>{errors.fullName.message}</Text> : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({ field: { value, onChange, onBlur } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Phone number</Text>
              <View style={[styles.phoneRow, errors.phone && styles.inputError]}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>🇳🇬 +234</Text>
                </View>
                <TextInput
                  value={value}
                  onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, 10))}
                  onBlur={onBlur}
                  placeholder="8012345678"
                  placeholderTextColor={Colors.onSurfaceMuted}
                  style={styles.phoneInput}
                  keyboardType="number-pad"
                  accessibilityLabel="Phone number"
                />
              </View>
              {errors.phone ? <Text style={styles.errorText}>{errors.phone.message}</Text> : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="referralCode"
          render={({ field: { value, onChange, onBlur } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Referral code (optional)</Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="e.g. LENZ2026"
                placeholderTextColor={Colors.onSurfaceMuted}
                style={styles.inputGhost}
                autoCapitalize="characters"
                accessibilityLabel="Referral code"
              />
            </View>
          )}
        />

        <Button label="Send OTP" onPress={handleSubmit(onSubmit)} loading={isSubmitting} style={styles.submit} />

        <Text
          style={styles.signIn}
          onPress={() => showToast('info', 'Sign in', 'Existing-account sign-in is coming soon.')}
        >
          Already have an account? <Text style={styles.signInLink}>Sign in</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  form: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputGhost: {
    backgroundColor: 'transparent',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  inputError: {
    borderColor: Colors.errorDim,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  phonePrefix: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
  },
  phonePrefixText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.lg,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.errorDim,
    marginTop: Spacing.xs,
  },
  submit: {
    marginTop: Spacing.md,
  },
  signIn: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  signInLink: {
    color: Colors.primary,
    fontFamily: 'Inter_500Medium',
  },
});
