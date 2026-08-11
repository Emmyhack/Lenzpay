import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BiometricPref } from '@/types/user';
import { TransactionLimits } from '@/constants/config';
import type { FraudAlert } from '@/types/security';
import { StorageKeys, dateSafeJsonStorage } from '@/services/persistence';

/** Local calendar day, used to roll the daily spend ledger over at midnight. */
export function dayKey(at: Date = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

interface SecurityState {
  biometricPref: BiometricPref;
  faceIdEnabled: boolean;
  pinRequiredEnabled: boolean;
  skipPinBelowThreshold: boolean;
  dailyLimitNGN: number;
  perTxnLimitNGN: number;
  /**
   * Spend accumulated against today's limit.
   *
   * Without this the daily limit was decorative: it was stored, displayed and
   * editable, but nothing ever counted against it, so a ₦500,000 limit did not
   * stop ₦5,000,000 of payments. It only works if it survives a restart, which
   * is why this store is persisted.
   */
  spentTodayNGN: number;
  /** Calendar day `spentTodayNGN` belongs to; a change rolls it back to zero. */
  spendDay: string;
  hasFraudAlert: boolean;
  fraudAlert: FraudAlert | null;

  // Fraud protection toggles
  newDeviceAlerts: boolean;
  unusualAmountAlerts: boolean;
  internationalBlocked: boolean;
  autoLockAfterFailedPin: boolean;

  setBiometricPref: (pref: BiometricPref) => void;
  toggleFaceId: (value: boolean) => void;
  togglePinRequired: (value: boolean) => void;
  toggleSkipPinBelowThreshold: (value: boolean) => void;
  setDailyLimit: (value: number) => void;
  setPerTxnLimit: (value: number) => void;
  /** Record a settled payment against today's limit. */
  recordSpend: (amountNGN: number, at?: Date) => void;
  /** Spend counted against today, after rolling over if the day has changed. */
  spentToday: (at?: Date) => number;
  /** Headroom left today. */
  remainingDailyNGN: (at?: Date) => number;
  clearFraudAlert: () => void;
  raiseFraudAlert: (alert: FraudAlert) => void;
  toggleNewDeviceAlerts: (value: boolean) => void;
  toggleUnusualAmountAlerts: (value: boolean) => void;
  toggleInternationalBlocked: (value: boolean) => void;
  toggleAutoLockAfterFailedPin: (value: boolean) => void;
}

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set, get) => ({
  biometricPref: 'none',
  faceIdEnabled: false,
  pinRequiredEnabled: true,
  skipPinBelowThreshold: true,
  dailyLimitNGN: TransactionLimits.defaultDailyLimitNGN,
  perTxnLimitNGN: TransactionLimits.defaultPerTxnLimitNGN,
  spentTodayNGN: 0,
  spendDay: dayKey(),
  hasFraudAlert: false,
  fraudAlert: null,

  newDeviceAlerts: true,
  unusualAmountAlerts: true,
  internationalBlocked: false,
  autoLockAfterFailedPin: true,

  setBiometricPref: (biometricPref) => set({ biometricPref }),
  toggleFaceId: (faceIdEnabled) => set({ faceIdEnabled }),
  togglePinRequired: (pinRequiredEnabled) => set({ pinRequiredEnabled }),
  toggleSkipPinBelowThreshold: (skipPinBelowThreshold) => set({ skipPinBelowThreshold }),
  setDailyLimit: (dailyLimitNGN) => set({ dailyLimitNGN }),
  setPerTxnLimit: (perTxnLimitNGN) => set({ perTxnLimitNGN }),

  recordSpend: (amountNGN, at = new Date()) => {
    const today = dayKey(at);
    const { spendDay, spentTodayNGN } = get();
    // A new day resets the counter rather than accumulating forever.
    const base = spendDay === today ? spentTodayNGN : 0;
    set({ spendDay: today, spentTodayNGN: base + Math.max(0, amountNGN) });
  },

  // Reads roll the day over implicitly, so a stale `spentTodayNGN` left over
  // from yesterday never counts against today's limit.
  spentToday: (at = new Date()) => {
    const { spendDay, spentTodayNGN } = get();
    return spendDay === dayKey(at) ? spentTodayNGN : 0;
  },

  remainingDailyNGN: (at = new Date()) =>
    Math.max(0, get().dailyLimitNGN - get().spentToday(at)),
  clearFraudAlert: () => set({ hasFraudAlert: false, fraudAlert: null }),
  raiseFraudAlert: (fraudAlert) => set({ hasFraudAlert: true, fraudAlert }),
  toggleNewDeviceAlerts: (newDeviceAlerts) => set({ newDeviceAlerts }),
  toggleUnusualAmountAlerts: (unusualAmountAlerts) => set({ unusualAmountAlerts }),
  toggleInternationalBlocked: (internationalBlocked) => set({ internationalBlocked }),
  toggleAutoLockAfterFailedPin: (autoLockAfterFailedPin) => set({ autoLockAfterFailedPin }),
    }),
    {
      name: StorageKeys.security,
      storage: dateSafeJsonStorage,
      // A transient fraud alert belongs to the session that raised it —
      // restoring one on launch would confront the user with a warning about a
      // payment they already dealt with.
      partialize: ({ hasFraudAlert: _a, fraudAlert: _b, ...rest }) => rest,
    }
  )
);
