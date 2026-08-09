import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';

const CATEGORIES = ['Food & Beverage', 'Transport', 'Retail', 'Services', 'Crypto', 'Other'];

const schema = z.object({
  businessName: z.string().trim().min(2, 'Enter your business name'),
  category: z.string().min(1, 'Choose a category'),
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit number'),
  email: z.string().trim().email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

export default function MerchantSignupScreen() {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: '', category: '', phone: '', email: '' },
  });

  const category = watch('category');

  const onSubmit = async () => {
    await new Promise((r) => setTimeout(r, 400));
    router.push('/(merchant)/onboarding/kyc');
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Set Up Your Business" subtitle="Step 1 of 4" />

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="businessName"
          render={({ field: { value, onChange, onBlur } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Business name</Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Emeka's Kitchen"
                placeholderTextColor={Colors.onSurfaceMuted}
                style={[styles.input, errors.businessName && styles.inputError]}
              />
              {errors.businessName ? <Text style={styles.errorText}>{errors.businessName.message}</Text> : null}
            </View>
          )}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setValue('category', c, { shouldValidate: true })} />
          ))}
        </View>
        {errors.category ? <Text style={styles.errorText}>{errors.category.message}</Text> : null}

        <Controller
          control={control}
          name="phone"
          render={({ field: { value, onChange, onBlur } }) => (
            <View style={[styles.field, styles.spaced]}>
              <Text style={styles.label}>Phone number</Text>
              <View style={[styles.phoneRow, errors.phone && styles.inputError]}>
                <Text style={styles.phonePrefix}>🇳🇬 +234</Text>
                <TextInput
                  value={value}
                  onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 10))}
                  onBlur={onBlur}
                  placeholder="8012345678"
                  placeholderTextColor={Colors.onSurfaceMuted}
                  style={styles.phoneInput}
                  keyboardType="number-pad"
                />
              </View>
              {errors.phone ? <Text style={styles.errorText}>{errors.phone.message}</Text> : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange, onBlur } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Business email</Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="hello@business.com"
                placeholderTextColor={Colors.onSurfaceMuted}
                style={[styles.input, errors.email && styles.inputError]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {errors.email ? <Text style={styles.errorText}>{errors.email.message}</Text> : null}
            </View>
          )}
        />

        <Button label="Continue" trailingArrow onPress={handleSubmit(onSubmit)} loading={isSubmitting} style={styles.submit} />
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
  spaced: {
    marginTop: Spacing.md,
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
  inputError: {
    borderColor: Colors.errorDim,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
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
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
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
    marginTop: Spacing.lg,
  },
});
