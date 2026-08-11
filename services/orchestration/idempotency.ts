import type { CurrencyCode } from '@/types/payment';
import type { FundingPlan } from '@/types/orchestration';
import { read, write } from '@/services/persistence';

/**
 * Idempotency store (§6.1).
 *
 * Critical here in a way it isn't for single-leg payments: a retried request
 * that re-runs a waterfall doesn't double-charge one account, it double-charges
 * three. Every execution is keyed, and a key that has already completed
 * returns the original result rather than executing again.
 *
 * Keys are *derived*, not random — a client that retries after a dropped
 * response must produce the same key, which it can only do if the key is a
 * function of the payment's identity rather than of the attempt.
 */

export type IdempotencyStatus = 'in_flight' | 'completed';

export interface IdempotencyRecord<T> {
  key: string;
  status: IdempotencyStatus;
  result?: T;
  createdAt: number;
  completedAt?: number;
}

export type BeginOutcome<T> =
  /** First time this key has been seen — the caller should execute. */
  | { state: 'fresh' }
  /** Already finished; replay the stored result without re-executing. */
  | { state: 'replay'; result: T }
  /** Another attempt with this key is still running. */
  | { state: 'in_flight'; since: number };

export class IdempotencyStore<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();
  private readonly ttlMs: number;
  private readonly storageKey: string | null;

  /**
   * @param storageKey persist under this key.
   *
   * An in-memory store forgets every key when the app restarts, so a payment
   * retried after a crash would execute a second time — exactly the
   * double-charge this class exists to prevent. Persisting matters most in the
   * case the store was written for.
   *
   * Only *completed* records are written. An `in_flight` record cannot be
   * trusted across a restart: the process that owned it is gone, so nothing
   * will ever complete or abandon it, and restoring it would deadlock the key
   * forever.
   */
  constructor(ttlMs = 24 * 60 * 60 * 1000, storageKey: string | null = null) {
    this.ttlMs = ttlMs;
    this.storageKey = storageKey;
    if (storageKey) {
      const saved = read<IdempotencyRecord<T>[]>(storageKey);
      if (saved) {
        for (const record of saved) {
          if (record.status === 'completed') this.records.set(record.key, record);
        }
      }
    }
  }

  private save(): void {
    if (!this.storageKey) return;
    write(
      this.storageKey,
      [...this.records.values()].filter((record) => record.status === 'completed')
    );
  }

  begin(key: string, now = Date.now()): BeginOutcome<T> {
    this.evictExpired(now);
    const existing = this.records.get(key);

    if (!existing) {
      this.records.set(key, { key, status: 'in_flight', createdAt: now });
      return { state: 'fresh' };
    }

    if (existing.status === 'completed' && existing.result !== undefined) {
      return { state: 'replay', result: existing.result };
    }

    return { state: 'in_flight', since: existing.createdAt };
  }

  complete(key: string, result: T, now = Date.now()): void {
    const existing = this.records.get(key);
    this.records.set(key, {
      key,
      status: 'completed',
      result,
      createdAt: existing?.createdAt ?? now,
      completedAt: now,
    });
    this.save();
  }

  /**
   * Drop a key so the caller may legitimately try again — used when an attempt
   * failed in a way that left no money moved, so a retry is safe.
   */
  abandon(key: string): void {
    this.records.delete(key);
    this.save();
  }

  peek(key: string): IdempotencyRecord<T> | undefined {
    return this.records.get(key);
  }

  private evictExpired(now: number): void {
    for (const [key, record] of this.records) {
      const age = now - (record.completedAt ?? record.createdAt);
      if (age > this.ttlMs) this.records.delete(key);
    }
  }
}

/**
 * Derive a stable key from what makes a payment *this* payment.
 *
 * Deliberately includes the plan's leg composition: if the user backs out and
 * re-picks different sources for the same amount and payee, that is a
 * genuinely different payment and must not replay the earlier result.
 */
export function deriveIdempotencyKey(input: {
  userId: string;
  payeeId: string;
  amount: number;
  currency: CurrencyCode;
  plan: FundingPlan;
  /** Distinguishes deliberate repeat payments of the same amount to the same payee. */
  attemptNonce: string;
}): string {
  const legFingerprint = input.plan.legs
    .map((leg) => `${leg.sourceId}:${leg.amountInSettlementCurrency}`)
    .join('|');

  return hash(
    [
      input.userId,
      input.payeeId,
      input.amount.toFixed(4),
      input.currency,
      input.plan.kind,
      legFingerprint,
      input.attemptNonce,
    ].join('~')
  );
}

/** FNV-1a — small, dependency-free, and stable across runtimes. */
function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `idem_${h.toString(36)}_${value.length.toString(36)}`;
}
