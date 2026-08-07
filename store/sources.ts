import { create } from 'zustand';
import type { PaymentSource } from '@/types/payment';
import { MOCK_SOURCES } from '@/mock/data';

interface SourcesState {
  sources: PaymentSource[];
  isLoading: boolean;
  setSources: (sources: PaymentSource[]) => void;
  addSource: (source: PaymentSource) => void;
  removeSource: (id: string) => void;
  setDefault: (id: string) => void;
  refreshBalances: () => Promise<void>;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: MOCK_SOURCES,
  isLoading: false,
  setSources: (sources) => set({ sources }),
  addSource: (source) => set({ sources: [...get().sources, source] }),
  removeSource: (id) => set({ sources: get().sources.filter((s) => s.id !== id) }),
  setDefault: (id) =>
    set({
      sources: get().sources.map((s) => ({ ...s, isDefault: s.id === id })),
    }),
  refreshBalances: async () => {
    set({ isLoading: true });
    // Replace with services/sources.ts calls once wired to a real backend.
    await new Promise((r) => setTimeout(r, 600));
    set({ isLoading: false, sources: get().sources.map((s) => ({ ...s, lastSynced: new Date() })) });
  },
}));
