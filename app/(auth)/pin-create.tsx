import { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { PINPad } from '@/components/auth/PINPad';
import { usePIN } from '@/hooks/usePIN';
import { useAuthStore } from '@/store/auth';

const PIN_LENGTH = 6;

export default function PinCreateScreen() {
  const router = useRouter();
  const { createPIN } = usePIN();
  const setHasPIN = useAuthStore((s) => s.setHasPIN);

  const [stage, setStage] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      setError(false);

      if (next.length !== PIN_LENGTH) return;

      if (stage === 'create') {
        setFirstPin(next);
        setTimeout(() => {
          setStage('confirm');
          setValue('');
        }, 150);
        return;
      }

      // stage === 'confirm'
      if (next === firstPin) {
        createPIN(next).then(() => {
          setHasPIN(true);
          router.replace('/(auth)/biometrics');
        });
      } else {
        setError(true);
        setTimeout(() => {
          setStage('create');
          setFirstPin('');
          setValue('');
          setError(false);
        }, 600);
      }
    },
    [stage, firstPin, createPIN, setHasPIN, router]
  );

  return (
    <View style={styles.wrap}>
      <ScreenHeader title={stage === 'create' ? 'Create your PIN' : 'Confirm your PIN'} showBack={stage === 'create'} />

      <View style={styles.body}>
        <Text style={styles.subtitle}>
          {stage === 'create'
            ? "This secures every payment you make — don't share it."
            : 'Enter the same 6 digits again.'}
        </Text>

        <View style={styles.padWrap}>
          <PINPad length={PIN_LENGTH} value={value} onChange={handleChange} error={error} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  padWrap: {
    marginTop: Spacing.md,
  },
});
