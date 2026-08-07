import { create } from 'zustand';
import type { User } from '@/types/user';

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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  hasPIN: false,
  hasCompletedOnboarding: false,
  setUser: (user) => set({ user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setHasPIN: (value) => set({ hasPIN: value }),
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
