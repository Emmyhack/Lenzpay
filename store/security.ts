import { create } from 'zustand';
import type { BiometricPref } from '@/types/user';
import { TransactionLimits } from '@/constants/config';
import type { FraudAlert } from '@/types/security';

interface SecurityState {
  biometricPref: BiometricPref;
  faceIdEnabled: boolean;
  pinRequiredEnabled: boolean;
  skipPinBelowThreshold: boolean;
  dailyLimitNGN: number;
  perTxnLimitNGN: number;
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
  clearFraudAlert: () => void;
  raiseFraudAlert: (alert: FraudAlert) => void;
  toggleNewDeviceAlerts: (value: boolean) => void;
  toggleUnusualAmountAlerts: (value: boolean) => void;
  toggleInternationalBlocked: (value: boolean) => void;
  toggleAutoLockAfterFailedPin: (value: boolean) => void;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  biometricPref: 'none',
  faceIdEnabled: false,
  pinRequiredEnabled: true,
  skipPinBelowThreshold: true,
  dailyLimitNGN: TransactionLimits.defaultDailyLimitNGN,
  perTxnLimitNGN: TransactionLimits.defaultPerTxnLimitNGN,
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
  clearFraudAlert: () => set({ hasFraudAlert: false, fraudAlert: null }),
  raiseFraudAlert: (fraudAlert) => set({ hasFraudAlert: true, fraudAlert }),
  toggleNewDeviceAlerts: (newDeviceAlerts) => set({ newDeviceAlerts }),
  toggleUnusualAmountAlerts: (unusualAmountAlerts) => set({ unusualAmountAlerts }),
  toggleInternationalBlocked: (internationalBlocked) => set({ internationalBlocked }),
  toggleAutoLockAfterFailedPin: (autoLockAfterFailedPin) => set({ autoLockAfterFailedPin }),
}));
