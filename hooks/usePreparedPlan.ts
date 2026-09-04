import { useCallback, useEffect, useRef, useState } from 'react';
import type { LockedPlan, PrepareFailureReason } from '@/types/orchestration';
import { deriveIdempotencyKey, lockedPlanExpired, paymentEngine } from '@/services/orchestration';
import { usePaymentStore } from '@/store/payment';
import { MOCK_USER } from '@/mock/data';

/**
 * Prepare the confirmed plan when the confirmation screen opens, and make sure
 * whatever it authorises is given back if the user walks away.
 *
 * `prepare()` places real holds — a card authorisation is a pending charge the
 * user can see on their statement. Doing that before they authenticate is the
 * deliberate design (ADR-013): it is what lets the confirmation screen show
 * figures that are committed rather than predicted. But it creates an
 * obligation that did not exist under the two-verb flow — **an abandoned
 * confirmation must release its authorisations**, or the user is left unable
 * to spend money on a payment they explicitly declined.
 *
 * That obligation is easy to forget at a call site and impossible to forget
 * here, which is why this is a hook and not inline effect code.
 */

export type PrepareStatus = 'idle' | 'preparing' | 'ready' | 'failed' | 'expired';

export interface PreparedPlanState {
  status: PrepareStatus;
  /** Usable plan. Null unless the lock is live — gates commit and execution. */
  locked: LockedPlan | null;
  /**
   * The last plan prepared, valid or not, for display only.
   *
   * When a lock expires the figures are stale but still worth showing: blanking
   * them loses the user's context for what they were about to pay. The screen
   * keeps them on-screen and marks them invalid instead — which is why this is
   * deliberately separate from `locked`, so a stale plan can never be executed
   * by reaching for the wrong field.
   */
  preview: LockedPlan | null;
  error: string | null;
  reason: PrepareFailureReason | null;
  /**
   * True when a failed prepare could not give back everything it placed. Needs
   * a person, not a retry — money is sitting unusable in a real account.
   */
  needsManualReview: boolean;
  /** Hand the plan off to execution. Suppresses the release on unmount. */
  commit: () => void;
  retry: () => void;
}

export function usePreparedPlan(): PreparedPlanState {
  const plan = usePaymentStore((s) => s.plan);
  const payee = usePaymentStore((s) => s.payee);
  const attemptNonce = usePaymentStore((s) => s.attemptNonce);
  const lockedPlan = usePaymentStore((s) => s.lockedPlan);
  const setLockedPlan = usePaymentStore((s) => s.setLockedPlan);

  const [status, setStatus] = useState<PrepareStatus>(lockedPlan ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<PrepareFailureReason | null>(null);
  const [needsManualReview, setNeedsManualReview] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /** Set once the plan is handed to the executor, so unmount must not release. */
  const committed = useRef(false);
  /** The authorisations this screen currently owes back. */
  const outstanding = useRef<{ locked: LockedPlan; key: string } | null>(null);

  const commit = useCallback(() => {
    committed.current = true;
    outstanding.current = null;
  }, []);

  const retry = useCallback(() => {
    // Give back the stale authorisation before taking a new one, or the user
    // ends up with two holds against the same funds.
    const pending = outstanding.current;
    if (pending) {
      outstanding.current = null;
      void paymentEngine.abandon(pending.locked, pending.key);
    }
    usePaymentStore.getState().clearLockedPlan();
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!plan || !payee) return;
    if (lockedPlan && attempt === 0) return;

    let cancelled = false;
    setStatus('preparing');
    setError(null);
    setReason(null);
    setNeedsManualReview(false);

    // Must match what `initiatePayment` derives, or the authorisations placed
    // here would be scoped to a different key than the ones execution expects.
    // Both derive from the *unprepared* plan; preparing never changes a leg's
    // settlement amount, so the fingerprint is stable across the stage.
    const idempotencyKey = deriveIdempotencyKey({
      userId: MOCK_USER.id,
      payeeId: payee.id,
      amount: plan.amount,
      currency: plan.currency,
      plan,
      attemptNonce,
    });

    (async () => {
      const result = await paymentEngine.prepare(plan, MOCK_USER.id, idempotencyKey);

      if (cancelled) {
        // The screen went away mid-flight. Nothing will render this, so give
        // back anything it placed rather than leaving it to time out.
        if (result.ok) await paymentEngine.abandon(result.locked, idempotencyKey);
        return;
      }

      if (!result.ok) {
        setStatus('failed');
        setError(result.message);
        setReason(result.reason);
        setNeedsManualReview(!result.fullyRolledBack);
        return;
      }

      outstanding.current = { locked: result.locked, key: idempotencyKey };
      setLockedPlan(result.locked);
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [plan, payee, attemptNonce, attempt, lockedPlan, setLockedPlan]);

  // Watch the lock. An authorisation has a TTL — a card hold expires in about
  // two minutes — and a user can sit on this screen for longer than that.
  // Capturing against a lapsed authorisation fails at the rail with an opaque
  // "hold not found", so the deadline is caught here and turned into something
  // the user can act on instead.
  useEffect(() => {
    if (status !== 'ready' || !lockedPlan?.expiresAt) return;

    const check = () => {
      if (!lockedPlanExpired(lockedPlan)) return;
      setStatus('expired');
      setError('This payment’s hold has expired. Refresh to check your funds again.');
      clearInterval(timer);
    };

    const timer = setInterval(check, 1_000);
    check();
    return () => clearInterval(timer);
  }, [status, lockedPlan]);

  // Release on the way out. Deliberately separate from the effect above so it
  // fires on unmount only, not on every dependency change.
  useEffect(() => {
    return () => {
      if (committed.current) return;
      const pending = outstanding.current;
      if (!pending) return;

      outstanding.current = null;
      // Fire and forget: the screen is already gone, and `abandon` is
      // idempotent, so a duplicate call is harmless.
      void paymentEngine.abandon(pending.locked, pending.key);
      usePaymentStore.getState().clearLockedPlan();
    };
  }, []);

  return {
    status,
    locked: status === 'ready' ? lockedPlan : null,
    preview: lockedPlan,
    error,
    reason,
    needsManualReview,
    commit,
    retry,
  };
}
