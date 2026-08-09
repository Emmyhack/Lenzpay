import { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { PINPad } from '@/components/auth/PINPad';
import { usePIN } from '@/hooks/usePIN';
import { showToast } from '@/components/ui/Toast';

const PIN_LENGTH = 6;
type Stage = 'current' | 'new' | 'confirm';

const STAGE_TITLE: Record<Stage, string> = {
  current: 'Enter current PIN',
  new: 'Create new PIN',
  confirm: 'Confirm new PIN',
};

export default function PinChangeScreen() {
  const router = useRouter();
  const { verifyPIN, createPIN } = usePIN();

  const [stage, setStage] = useState<Stage>('current');
  const [newPin, setNewPin] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const handleChange = useCallback(
    async (next: string) => {
      setValue(next);
      setError(false);
      if (next.length !== PIN_LENGTH) return;

      if (stage === 'current') {
        const isValid = await verifyPIN(next);
        if (isValid) {
          setStage('new');
          setValue('');
        } else {
          setError(true);
          setTimeout(() => setValue(''), 400);
        }
        return;
      }

      if (stage === 'new') {
        setNewPin(next);
        setStage('confirm');
        setValue('');
        return;
      }

      // stage === 'confirm'
      if (next === newPin) {
        await createPIN(next);
        showToast('success', 'PIN updated');
        router.back();
      } else {
        setError(true);
        setTimeout(() => {
          setStage('new');
          setNewPin('');
          setValue('');
          setError(false);
        }, 600);
      }
    },
    [stage, newPin, verifyPIN, createPIN, router]
  );

  return (
    <View style={styles.wrap}>
      <ScreenHeader title={STAGE_TITLE[stage]} />

      <View style={styles.body}>
        <PINPad length={PIN_LENGTH} value={value} onChange={handleChange} error={error} />
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
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
});
