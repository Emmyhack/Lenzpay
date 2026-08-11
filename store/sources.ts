import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StorageKeys, dateSafeJsonStorage } from '@/services/persistence';
import type { PaymentSource } from '@/types/payment';
import { MOCK_SOURCES } from '@/mock/data';
import type { FundingLeg } from '@/types/orchestration';

interface SourcesState {
  sources: PaymentSource[];
  isLoading: boolean;
  setSources: (sources: PaymentSource[]) => void;
  addSource: (source: PaymentSource) => void;
  removeSource: (id: string) => void;
  setDefault: (id: string) => void;
  /** User-set ranking preference, 0..100 (§5.2). */
  setPriorityWeight: (id: string, weight: number) => void;
  /** "Keep buffer" flag — reserve funds are drawn on last (§5.2). */
  setReserve: (id: string, isReserve: boolean) => void;
  refreshBalances: () => Promise<void>;
  appliedTransactionIds: string[];
  applySettledTransaction: (transactionId: string, legs: FundingLeg[]) => void;
}

export const useSourcesStore = create<SourcesState>()(
  persist(
    (set, get) => ({
  sources: MOCK_SOURCES,
  isLoading: false,
  appliedTransactionIds: [],
  setSources: (sources) => set({ sources }),
  addSource: (source) => set({ sources: [...get().sources, source] }),
  removeSource: (id) => set({ sources: get().sources.filter((s) => s.id !== id) }),
  setDefault: (id) =>
    set({
      sources: get().sources.map((s) => ({ ...s, isDefault: s.id === id })),
    }),
  setPriorityWeight: (id, weight) =>
    set({
      sources: get().sources.map((s) =>
        s.id === id ? { ...s, priorityWeight: Math.round(Math.min(100, Math.max(0, weight))) } : s
      ),
    }),
  setReserve: (id, isReserve) =>
    set({
      sources: get().sources.map((s) => (s.id === id ? { ...s, isReserve } : s)),
    }),
  refreshBalances: async () => {
    set({ isLoading: true });
    // Replace with services/sources.ts calls once wired to a real backend.
    await new Promise((r) => setTimeout(r, 600));
    set({ isLoading: false, sources: get().sources.map((s) => ({ ...s, lastSynced: new Date() })) });
  },
  applySettledTransaction: (transactionId, legs) => {
    if (get().appliedTransactionIds.includes(transactionId)) return;
    const captured = new Map(legs.filter((leg) => leg.status === 'captured').map((leg) => [leg.sourceId, leg]));
    set({
      sources: get().sources.map((source) => {
        const leg = captured.get(source.id);
        if (!leg) return source;
        return {
          ...source,
          rawBalance: Math.max(0, source.rawBalance - leg.amountInSourceCurrency),
          balance: Math.max(0, source.balance - leg.amountInSettlementCurrency - leg.feeInSettlementCurrency),
          lastSynced: new Date(),
        };
      }),
      appliedTransactionIds: [...get().appliedTransactionIds, transactionId],
    });
  },
    }),
    {
      name: StorageKeys.sources,
      storage: dateSafeJsonStorage,
      // `isLoading` is a UI flag for an in-flight refresh; persisting it would
      // restore a spinner that nothing is going to resolve.
      partialize: ({ isLoading: _ignored, ...rest }) => rest,
    }
  )
);
