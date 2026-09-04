import { useCallback, useState } from 'react';
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { BiometricGate } from '@/components/auth/BiometricGate';
import { PINPad } from '@/components/auth/PINPad';
import { PlanDisclosure } from '@/components/payment/PlanDisclosure';
import { GuaranteeRows } from '@/components/payment/GuaranteeRows';
import { ExpiredScrim } from '@/components/payment/ExpiredScrim';
import { Icon } from '@/components/ui/Icon';
import { usePIN } from '@/hooks/usePIN';
import { usePreparedPlan } from '@/hooks/usePreparedPlan';
import { useDismiss } from '@/hooks/useDismiss';
import { usePaymentStore } from '@/store/payment';

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 3;

export default function ConfirmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verifyPIN } = usePIN();
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const merchant = usePaymentStore((s) => s.merchant);
  const payee = usePaymentStore((s) => s.payee);
  const plan = usePaymentStore((s) => s.plan);
  const advance = usePaymentStore((s) => s.advance);
  const fail = usePaymentStore((s) => s.fail);

  // Authorise before authenticating: what the user is about to approve should
  // be committed, not estimated (ADR-013).
  const preparation = usePreparedPlan();
  // Falls back to the amount screen: cancelling a payment should return you to
  // where you'd change it, not strand you if this screen was entered directly.
  const dismiss = useDismiss('/(consumer)/scan/amount');

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const proceed = useCallback(() => {
    // Hand the authorisations to the executor so unmount does not release them.
    preparation.commit();
    advance('processing');
    router.push('/(consumer)/scan/processing');
  }, [advance, preparation, router]);

  const abandon = useCallback(() => {
    // The hook releases whatever was held; this just leaves the screen.
    dismiss();
  }, [dismiss]);

  const handlePinChange = useCallback(
    async (next: string) => {
      setPin(next);
      setError(false);
      // Nothing to authenticate until the plan is actually locked.
      if (next.length !== PIN_LENGTH || lockedOut || preparation.status !== 'ready') return;

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
    [attempts, lockedOut, preparation.status, proceed, verifyPIN]
  );

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + Spacing.xxxl }]}>
      <View style={styles.summary}>
        <Text style={styles.amount}>₦{amountNGN.toLocaleString()}</Text>
        <Text style={styles.merchant}>to {payee?.displayName ?? merchant?.name ?? 'merchant'}</Text>
      </View>

      {/* The plan block, veiled rather than removed once its hold lapses —
          the figures stay for context, the scrim stops them reading as live. */}
      <View
        style={[
          styles.planBlock,
          // The scrim fills this block absolutely, so the block itself has to
          // be tall enough to hold the message and its action — otherwise the
          // overlay spills over the content it is meant to be covering.
          preparation.status === 'expired' && styles.planBlockExpired,
        ]}
      >
        {/* §5.5: the rate and fee are always shown before the final confirm,
            never silently applied. */}
        {plan ? <PlanDisclosure plan={preparation.preview ?? plan} /> : null}

        {/* Which accounts are genuinely committed, and which Lenz is covering.
            Different promises, so the user sees which is which (ADR-013). */}
        {preparation.preview ? (
          <View style={styles.guarantees}>
            <GuaranteeRows legs={preparation.preview.legs} />
          </View>
        ) : null}

        {preparation.status === 'expired' ? (
          <ExpiredScrim
            message={preparation.error ?? 'This payment’s hold has expired.'}
            onRefresh={preparation.retry}
          />
        ) : null}
      </View>

      {preparation.status === 'preparing' ? (
        <View style={styles.preparingRow}>
          <ActivityIndicator size="small" color={Colors.onSurfaceMuted} />
          <Text style={styles.preparingText}>Securing your funds…</Text>
        </View>
      ) : null}

      {preparation.status === 'failed' ? (
        <View style={styles.prepareError}>
          <Icon name="alert-circle" size={16} color={Colors.error} />
          <Text style={styles.prepareErrorText}>{preparation.error}</Text>
          <View style={styles.prepareActions}>
            {/* A missing signature or a lapsed rate is recoverable by asking
                again. A moved balance is not — that needs a new plan. */}
            {preparation.reason === 'signature_required' ||
            preparation.reason === 'rate_expired' ? (
              <Pressable onPress={preparation.retry} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.prepareRetry}>Try again</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                fail(preparation.error ?? 'This payment could not be prepared.', preparation.needsManualReview);
                router.replace('/(consumer)/scan/failed');
              }}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.cancel}>Back</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {lockedOut ? (
        <View style={styles.lockout}>
          <Text style={styles.lockoutTitle}>Too many attempts</Text>
          <Text style={styles.lockoutBody}>For your security, try again later or contact support.</Text>
          <Pressable onPress={dismiss} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.cancel}>Back to payment</Text>
          </Pressable>
        </View>
      ) : preparation.status === 'ready' ? (
        <>
          <BiometricGate onSuccess={proceed} promptMessage={`Confirm payment of ₦${amountNGN.toLocaleString()}`} />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <PINPad length={PIN_LENGTH} value={pin} onChange={handlePinChange} error={error} />
          {verifying ? <Text style={styles.verifying}>Verifying…</Text> : null}

          <Pressable onPress={abandon} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    // paddingTop is applied inline with the safe-area inset added.
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
  planBlock: {
    width: '100%',
    // Anchors the expiry scrim, which fills this block absolutely.
    position: 'relative',
  },
  planBlockExpired: {
    minHeight: 190,
  },
  guarantees: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  preparingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceMuted,
  },
  prepareError: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  prepareErrorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  prepareActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  prepareRetry: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.primary,
    marginTop: Spacing.xxl,
    padding: Spacing.sm,
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
