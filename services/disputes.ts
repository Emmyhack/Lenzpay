import type { FundingLeg } from '@/types/orchestration';
import type { Transaction } from '@/types/payment';
import { Ledger, reversalPostings } from '@/services/orchestration/ledger';
import { nextId } from '@/services/orchestration/ids';
import { roundCurrency } from '@/services/money';

/**
 * Disputes and partial reversal (§7).
 *
 * §7 makes the point that a single payment can touch several accounts and
 * rails, and that "a partial reversal — e.g. reversing only the crypto leg of
 * a waterfall — must be a first-class operation, not a manual workaround."
 *
 * The ledger has supported that since it was written: every posting carries a
 * `legId`, so one leg's entries can be mirrored without touching the others.
 * What was missing was anything to *drive* it. This is that: a dispute is
 * raised against a whole transaction or against specific legs, and resolving
 * it in the user's favour reverses exactly those legs.
 *
 * Submission is queued rather than sent. There is no dispute backend yet, and
 * a queue that survives to be flushed later is honest, where a button that
 * silently drops the case is not.
 */

export type DisputeReason =
  | 'not_received'
  | 'wrong_amount'
  | 'duplicate'
  | 'unauthorised'
  | 'wrong_payee'
  | 'other';

export type DisputeStatus =
  | 'draft'
  | 'queued'
  | 'submitted'
  | 'resolved_refunded'
  | 'resolved_rejected';

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  not_received: "I paid but the merchant says they didn't receive it",
  wrong_amount: 'The amount charged was wrong',
  duplicate: 'I was charged more than once',
  unauthorised: "I didn't authorise this payment",
  wrong_payee: 'This went to the wrong person',
  other: 'Something else',
};

export interface Dispute {
  id: string;
  transactionId: string;
  txnRef: string;
  reason: DisputeReason;
  detail?: string;
  /**
   * Legs being disputed. Empty means the whole transaction.
   *
   * Scoping to legs is what makes a partial reversal possible: if the bank leg
   * settled correctly and only the crypto off-ramp failed, only that leg should
   * unwind.
   */
  legIds: string[];
  /** Total under dispute, in settlement currency. */
  amount: number;
  status: DisputeStatus;
  createdAt: number;
  submittedAt?: number;
  resolvedAt?: number;
}

export interface RaiseDisputeInput {
  transaction: Transaction;
  reason: DisputeReason;
  detail?: string;
  /** Omit to dispute the whole transaction. */
  legs?: FundingLeg[];
  now?: number;
}

export class DisputeQueue {
  private readonly disputes = new Map<string, Dispute>();

  /**
   * Raise a dispute. Queued locally — there is no dispute backend yet, and a
   * queue that can be flushed later is honest where a no-op button is not.
   */
  raise(input: RaiseDisputeInput): Dispute {
    const now = input.now ?? Date.now();
    const legs = input.legs ?? [];

    const amount =
      legs.length > 0
        ? roundCurrency(
            legs.reduce((sum, leg) => sum + leg.amountInSettlementCurrency, 0),
            'NGN'
          )
        : input.transaction.amount;

    const dispute: Dispute = {
      id: nextId('dsp'),
      transactionId: input.transaction.id,
      txnRef: input.transaction.txnRef,
      reason: input.reason,
      detail: input.detail,
      legIds: legs.map((leg) => leg.id),
      amount,
      status: 'queued',
      createdAt: now,
    };

    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  get(id: string): Dispute | undefined {
    return this.disputes.get(id);
  }

  forTransaction(transactionId: string): Dispute[] {
    return [...this.disputes.values()].filter((d) => d.transactionId === transactionId);
  }

  queued(): Dispute[] {
    return [...this.disputes.values()].filter((d) => d.status === 'queued');
  }

  markSubmitted(id: string, now = Date.now()): void {
    const dispute = this.disputes.get(id);
    if (!dispute) return;
    dispute.status = 'submitted';
    dispute.submittedAt = now;
  }

  /**
   * Resolve in the user's favour and unwind the disputed legs in the ledger.
   *
   * Reverses only the entries belonging to the disputed legs — the rest of the
   * transaction stands. Returns the ids of the reversal entries written.
   */
  resolveRefunded(id: string, ledger: Ledger, now = Date.now()): string[] {
    const dispute = this.disputes.get(id);
    if (!dispute) return [];

    const original = (
      dispute.legIds.length > 0
        ? dispute.legIds.flatMap((legId) => ledger.forLeg(legId))
        : ledger.forTransaction(dispute.transactionId)
    ).filter((entry) => !entry.reversalOf);

    const written =
      original.length > 0
        ? ledger.post(
            dispute.transactionId,
            reversalPostings(original, `dispute ${dispute.txnRef}: ${dispute.reason}`),
            now
          )
        : [];

    dispute.status = 'resolved_refunded';
    dispute.resolvedAt = now;
    return written.map((entry) => entry.id);
  }

  resolveRejected(id: string, now = Date.now()): void {
    const dispute = this.disputes.get(id);
    if (!dispute) return;
    dispute.status = 'resolved_rejected';
    dispute.resolvedAt = now;
  }
}

/** Process-wide queue for the dev/mock build. */
export const disputeQueue = new DisputeQueue();

/**
 * Whether a transaction can still be disputed. Real schemes impose a window;
 * 90 days is a common chargeback horizon and a sane default until the partner
 * agreement sets one.
 */
export const DISPUTE_WINDOW_DAYS = 90;

export function isDisputable(transaction: Transaction, now = Date.now()): boolean {
  if (transaction.status !== 'completed') return false;
  const age = now - transaction.timestamp.getTime();
  return age <= DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
