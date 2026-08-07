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

  setBiometricPref: (pref: BiometricPref) => void;
  toggleFaceId: (value: boolean) => void;
  togglePinRequired: (value: boolean) => void;
  toggleSkipPinBelowThreshold: (value: boolean) => void;
  setDailyLimit: (value: number) => void;
  setPerTxnLimit: (value: number) => void;
  clearFraudAlert: () => void;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  biometricPref: 'none',
  faceIdEnabled: false,
  pinRequiredEnabled: true,
  skipPinBelowThreshold: true,
  dailyLimitNGN: TransactionLimits.defaultDailyLimitNGN,
  perTxnLimitNGN: TransactionLimits.defaultPerTxnLimitNGN,
  hasFraudAlert: false,

  setBiometricPref: (biometricPref) => set({ biometricPref }),
  toggleFaceId: (faceIdEnabled) => set({ faceIdEnabled }),
  togglePinRequired: (pinRequiredEnabled) => set({ pinRequiredEnabled }),
  toggleSkipPinBelowThreshold: (skipPinBelowThreshold) => set({ skipPinBelowThreshold }),
  setDailyLimit: (dailyLimitNGN) => set({ dailyLimitNGN }),
  setPerTxnLimit: (perTxnLimitNGN) => set({ perTxnLimitNGN }),
  clearFraudAlert: () => set({ hasFraudAlert: false }),
}));
