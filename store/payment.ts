import { create } from 'zustand';
import type { Merchant, PaymentFlowState, PaymentMode, PaymentSource, SplitAllocation } from '@/types/payment';

interface PaymentFlowStoreState {
  flowState: PaymentFlowState;
  merchant: Merchant | null;
  amountNGN: number;
  mode: PaymentMode | null;
  selectedSource: PaymentSource | null;
  splitAllocations: SplitAllocation[] | null;
  failureReason: string | null;

  setMerchant: (merchant: Merchant) => void;
  setAmount: (amountNGN: number) => void;
  setMode: (mode: PaymentMode) => void;
  selectSource: (source: PaymentSource) => void;
  setSplitAllocations: (allocations: SplitAllocation[]) => void;
  advance: (state: PaymentFlowState) => void;
  fail: (reason: string) => void;
  reset: () => void;
}

const initialState = {
  flowState: 'idle' as PaymentFlowState,
  merchant: null,
  amountNGN: 0,
  mode: null,
  selectedSource: null,
  splitAllocations: null,
  failureReason: null,
};

export const usePaymentStore = create<PaymentFlowStoreState>((set) => ({
  ...initialState,
  setMerchant: (merchant) => set({ merchant, flowState: 'merchant_found' }),
  setAmount: (amountNGN) => set({ amountNGN, flowState: 'amount_entered' }),
  setMode: (mode) => set({ mode }),
  selectSource: (selectedSource) => set({ selectedSource, flowState: 'source_selected' }),
  setSplitAllocations: (splitAllocations) => set({ splitAllocations, flowState: 'split_confirmed' }),
  advance: (flowState) => set({ flowState }),
  fail: (failureReason) => set({ failureReason, flowState: 'failed' }),
  reset: () => set(initialState),
}));
