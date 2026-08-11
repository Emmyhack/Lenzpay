import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StorageKeys, dateSafeJsonStorage } from '@/services/persistence';
import type { MerchantProfile } from '@/types/merchant';
import { MOCK_MERCHANT_PROFILE } from '@/mock/merchant';

interface MerchantState {
  profile: MerchantProfile | null;
  hasCompletedOnboarding: boolean;
  setProfile: (profile: MerchantProfile) => void;
  updateProfile: (patch: Partial<MerchantProfile>) => void;
  completeOnboarding: () => void;
}

export const useMerchantStore = create<MerchantState>()(
  persist(
    (set) => ({
  profile: MOCK_MERCHANT_PROFILE,
  hasCompletedOnboarding: true,
  setProfile: (profile) => set({ profile }),
  updateProfile: (patch) => set((state) => ({ profile: state.profile ? { ...state.profile, ...patch } : state.profile })),
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
    }),
    { name: StorageKeys.merchant, storage: dateSafeJsonStorage }
  )
);
