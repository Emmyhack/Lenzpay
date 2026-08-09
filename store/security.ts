import { create } from 'zustand';
import type { BiometricPref } from '@/types/user';
import { TransactionLimits } from '@/constants/config';

interface SecurityState {
  biometricPref: BiometricPref;
  faceIdEnabled: boolean;
  pinRequiredEnabled: boolean;
  skipPinBelowThreshold: boolean;
  dailyLimitNGN: number;
  perTxnLimitNGN: number;
  hasFraudAlert: boolean;

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
  hasFraudAlert: true,

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
  clearFraudAlert: () => set({ hasFraudAlert: false }),
  toggleNewDeviceAlerts: (newDeviceAlerts) => set({ newDeviceAlerts }),
  toggleUnusualAmountAlerts: (unusualAmountAlerts) => set({ unusualAmountAlerts }),
  toggleInternationalBlocked: (internationalBlocked) => set({ internationalBlocked }),
  toggleAutoLockAfterFailedPin: (autoLockAfterFailedPin) => set({ autoLockAfterFailedPin }),
}));
