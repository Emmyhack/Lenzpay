import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Icon } from '@/components/ui/Icon';
import { showToast } from '@/components/ui/Toast';
import { googleAuth, initialsFor, type GoogleIdentity } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

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
  const setUser = useAuthStore((s) => s.setUser);

  const [google, setGoogle] = useState<GoogleIdentity | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', phone: '', referralCode: '' },
    mode: 'onBlur',
  });

  /**
   * Google fills the form and proves the email. It does not finish the signup.
   *
   * A LenzPay account is keyed to a phone number — that is what a NUBAN
   * lookup, a direct-debit mandate and KYC are tied to, and what a payee sees.
   * So the OTP step stays even for a Google signup; skipping it would create an
   * account that cannot be paid to or from.
   */
  const handleGoogle = async () => {
    setGoogleBusy(true);
    const result = await googleAuth().signIn();
    setGoogleBusy(false);

    if (!result.ok) {
      if (result.reason === 'failed') showToast('error', 'Google sign-in failed', result.message);
      return;
    }

    const { identity } = result;
    if (!identity.emailVerified) {
      // Google itself says the address is unproven, so we must not present it
      // as verified further down the flow.
      showToast('error', 'Unverified email', 'Verify this address with Google, then try again.');
      return;
    }

    setGoogle(identity);
    setValue('fullName', identity.fullName, { shouldValidate: true });
  };

  const onSubmit = async (values: SignupForm) => {
    // Replace with a real signup endpoint; services/auth.ts holds the seam.
    await new Promise((r) => setTimeout(r, 400));

    if (google) {
      setUser({
        id: `usr_${google.googleId}`,
        fullName: values.fullName,
        phone: `+234${values.phone}`,
        email: google.email,
        emailVerified: true,
        googleId: google.googleId,
        authProvider: 'google',
        avatarInitials: initialsFor(values.fullName, google.email),
        kycStatus: 'unstarted',
        biometricPref: 'none',
        referralCode: values.referralCode?.trim() || '',
        createdAt: new Date(),
      });
    }

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
        {google ? (
          <View style={styles.googleLinked}>
            <Icon name="checkmark-circle" size={16} color={Colors.success} />
            <View style={styles.googleLinkedText}>
              <Text style={styles.googleLinkedTitle}>{google.email}</Text>
              <Text style={styles.googleLinkedSubtitle}>
                Email verified by Google. Add your phone number to finish.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <GoogleButton loading={googleBusy} onPress={handleGoogle} />
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
          </>
        )}

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
  googleLinked: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  googleLinkedText: {
    flex: 1,
  },
  googleLinkedTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  googleLinkedSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.outlineVariant,
  },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    marginHorizontal: Spacing.md,
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
