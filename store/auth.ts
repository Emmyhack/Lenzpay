import { create } from 'zustand';
import type { User } from '@/types/user';
import { MOCK_USER } from '@/mock/data';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hasPIN: boolean;
  hasCompletedOnboarding: boolean;
  setUser: (user: User | null) => void;
  setAuthenticated: (value: boolean) => void;
  setHasPIN: (value: boolean) => void;
  completeOnboarding: () => void;
  logout: () => void;
}

// Seeded with a mock user so the profile/home screens have realistic data
// to render out of the box — swap for a real session once services/auth.ts
// exists and the onboarding flow calls setUser() itself.
export const useAuthStore = create<AuthState>((set) => ({
  user: MOCK_USER,
  isAuthenticated: true,
  hasPIN: false,
  hasCompletedOnboarding: false,
  setUser: (user) => set({ user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setHasPIN: (value) => set({ hasPIN: value }),
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
