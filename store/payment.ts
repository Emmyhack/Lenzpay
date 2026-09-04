import { create } from 'zustand';
import type {
  Merchant,
  PaymentFlowState,
  PaymentMode,
  PaymentSource,
  SplitAllocation,
  Transaction,
} from '@/types/payment';
import type { FundingLeg, FundingPlan, LockedPlan, Payee } from '@/types/orchestration';
import { payeeFromMerchant } from '@/mock/payees';

interface PaymentFlowStoreState {
  flowState: PaymentFlowState;
  merchant: Merchant | null;
  /** Settlement target for the orchestration engine (§3.3). */
  payee: Payee | null;
  amountNGN: number;
  /** Set when a merchant's QR pins the amount — the user can't edit it. */
  fixedAmount: number | null;
  mode: PaymentMode | null;
  selectedSource: PaymentSource | null;
  splitAllocations: SplitAllocation[] | null;
  /**
   * The plan the user confirmed. Carried through to execution verbatim so the
   * accounts charged are exactly the ones shown on the confirm screen.
   */
  plan: FundingPlan | null;
  /**
   * The plan once it has been prepared: rates re-locked, authorisations placed,
   * float cover obtained. This — not `plan` — is what the confirm screen
   * renders and what executes, so the figures the user approves are committed
   * rather than estimated (ADR-013).
   *
   * Holding real authorisations means abandoning the flow has to release them;
   * see `clearLockedPlan`.
   */
  lockedPlan: LockedPlan | null;
  /**
   * Distinguishes a deliberate repeat payment from a retry of the same one.
   * Regenerated per attempt; feeds the idempotency key.
   */
  attemptNonce: string;
  failureReason: string | null;
  /** A failure left money moved that couldn't be automatically returned (§5.7). */
  needsManualReview: boolean;
  lastTransaction: Transaction | null;
  /** Per-account breakdown for the receipt (§5.4). */
  settledLegs: FundingLeg[] | null;
  /**
   * Float-fronted payments only: accounts not yet debited. The payee is paid
   * either way, but the user will see these debits land later, so the receipt
   * says so rather than letting them arrive unexplained.
   */
  pendingCollectionLegs: FundingLeg[] | null;

  setMerchant: (merchant: Merchant, payee?: Payee) => void;
  setPayee: (payee: Payee, fixedAmount?: number) => void;
  setAmount: (amountNGN: number) => void;
  setMode: (mode: PaymentMode) => void;
  selectSource: (source: PaymentSource) => void;
  setSplitAllocations: (allocations: SplitAllocation[]) => void;
  setPlan: (plan: FundingPlan) => void;
  setLockedPlan: (locked: LockedPlan | null) => void;
  /** Forget a prepared plan. The caller must release its holds first. */
  clearLockedPlan: () => void;
  advance: (state: PaymentFlowState) => void;
  succeed: (transaction: Transaction, legs: FundingLeg[], pending?: FundingLeg[]) => void;
  fail: (reason: string, needsManualReview?: boolean) => void;
  /** Retry the same payment — new nonce so the engine treats it as a new attempt. */
  retry: () => void;
  reset: () => void;
}

function newNonce(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const initialState = {
  flowState: 'idle' as PaymentFlowState,
  merchant: null,
  payee: null,
  amountNGN: 0,
  fixedAmount: null,
  mode: null,
  selectedSource: null,
  splitAllocations: null,
  plan: null,
  lockedPlan: null,
  failureReason: null,
  needsManualReview: false,
  lastTransaction: null,
  settledLegs: null,
  pendingCollectionLegs: null,
};

export const usePaymentStore = create<PaymentFlowStoreState>((set, get) => ({
  ...initialState,
  attemptNonce: newNonce(),

  setMerchant: (merchant, payee) =>
    set({
      merchant,
      payee: payee ?? payeeFromMerchant(merchant),
      flowState: 'merchant_found',
    }),

  setPayee: (payee, fixedAmount) =>
    set({
      payee,
      fixedAmount: fixedAmount ?? null,
      amountNGN: fixedAmount ?? get().amountNGN,
      flowState: 'merchant_found',
    }),

  setAmount: (amountNGN) => set({ amountNGN, flowState: 'amount_entered' }),
  setMode: (mode) => set({ mode }),
  selectSource: (selectedSource) => set({ selectedSource, flowState: 'source_selected' }),
  setSplitAllocations: (splitAllocations) =>
    set({ splitAllocations, flowState: 'split_confirmed' }),
  // A new plan invalidates any preparation of the previous one.
  setPlan: (plan) => set({ plan, lockedPlan: null }),
  setLockedPlan: (lockedPlan) => set({ lockedPlan }),
  clearLockedPlan: () => set({ lockedPlan: null }),
  advance: (flowState) => set({ flowState }),

  succeed: (lastTransaction, settledLegs, pendingCollectionLegs = []) =>
    set({
      lastTransaction,
      settledLegs,
      pendingCollectionLegs: pendingCollectionLegs.length > 0 ? pendingCollectionLegs : null,
      flowState: 'success',
      failureReason: null,
    }),

  fail: (failureReason, needsManualReview = false) =>
    set({ failureReason, needsManualReview, flowState: 'failed' }),

  retry: () =>
    set({
      attemptNonce: newNonce(),
      // A retry is a new attempt with a new idempotency key, so the previous
      // preparation's authorisations no longer belong to it.
      lockedPlan: null,
      failureReason: null,
      needsManualReview: false,
      flowState: 'amount_entered',
    }),

  reset: () => set({ ...initialState, attemptNonce: newNonce() }),
}));
