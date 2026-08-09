import { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { BiometricGate } from '@/components/auth/BiometricGate';
import { PINPad } from '@/components/auth/PINPad';
import { usePIN } from '@/hooks/usePIN';
import { usePaymentStore } from '@/store/payment';

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 3;

export default function ConfirmScreen() {
  const router = useRouter();
  const { verifyPIN } = usePIN();
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const merchant = usePaymentStore((s) => s.merchant);
  const advance = usePaymentStore((s) => s.advance);

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const proceed = useCallback(() => {
    advance('processing');
    router.push('/(consumer)/scan/processing');
  }, [advance, router]);

  const handlePinChange = useCallback(
    async (next: string) => {
      setPin(next);
      setError(false);
      if (next.length !== PIN_LENGTH || lockedOut) return;

      setVerifying(true);
      const isValid = await verifyPIN(next);
      setVerifying(false);

      if (isValid) {
        proceed();
        return;
      }

      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setError(true);
      setTimeout(() => setPin(''), 400);

      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockedOut(true);
      }
    },
    [attempts, lockedOut, proceed, verifyPIN]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <Text style={styles.amount}>₦{amountNGN.toLocaleString()}</Text>
        <Text style={styles.merchant}>to {merchant?.name ?? 'merchant'}</Text>
      </View>

      {lockedOut ? (
        <View style={styles.lockout}>
          <Text style={styles.lockoutTitle}>Too many attempts</Text>
          <Text style={styles.lockoutBody}>For your security, try again later or contact support.</Text>
          <Text style={styles.cancel} onPress={() => router.back()}>
            Back to Home
          </Text>
        </View>
      ) : (
        <>
          <BiometricGate onSuccess={proceed} promptMessage={`Confirm payment of ₦${amountNGN.toLocaleString()}`} />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <PINPad length={PIN_LENGTH} value={pin} onChange={handlePinChange} error={error} />
          {verifying ? <Text style={styles.verifying}>Verifying…</Text> : null}

          <Text style={styles.cancel} onPress={() => router.back()}>
            Cancel
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  summary: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  amount: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.displaySm.fontSize,
    color: Colors.onSurface,
  },
  merchant: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '60%',
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
  verifying: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.md,
  },
  cancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xxl,
    padding: Spacing.sm,
  },
  lockout: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  lockoutTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.error,
  },
  lockoutBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
