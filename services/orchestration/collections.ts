import type { CurrencyCode, PaymentSource } from '@/types/payment';
import type { FundingLeg } from '@/types/orchestration';
import { Treasury as TreasuryConfig } from '@/constants/config';
import { roundCurrency } from '@/services/money';
import { StorageKeys, read, write } from '@/services/persistence';
import { collectionCost, nettingSaving } from './costs';
import { nextId } from './ids';
import { DEFAULT_HOLD_TTL_MS, type RailRegistry } from './rails';

/**
 * Deferred, netted collection.
 *
 * ## Why this exists
 *
 * A waterfall pays a fixed debit fee *per leg*. Collected inline, a user making
 * five payments a day across three accounts costs fifteen debits. But the float
 * has already paid every payee — so nothing requires collection to happen
 * immediately, or one debit at a time.
 *
 * Netting collapses that to one debit per account per sweep: fifteen becomes
 * three. The saving scales with how active a user is, which inverts the
 * economics — heavy users become cheaper to serve per payment rather than
 * more expensive.
 *
 * ## What it costs
 *
 * Exposure lives longer. Money is owed to the float from settlement until the
 * next sweep instead of for seconds, so `Treasury`'s per-user and global
 * ceilings are doing real work here rather than guarding an edge case. Sweep
 * cadence is a direct trade of collection cost against exposure duration.
 *
 * Only available where a float exists — see `LaunchPhase` in config. Under
 * `partner_tsp` there is no float, so collection is inline and this is unused.
 */

export type CollectionStatus = 'pending' | 'collected' | 'failed' | 'escalated';

export interface CollectionItem {
  id: string;
  transactionId: string;
  userId: string;
  sourceId: string;
  source: PaymentSource;
  amountInSourceCurrency: number;
  currency: CurrencyCode;
  /** What this leg delivered to the payee — used to release treasury exposure. */
  amountInSettlementCurrency: number;
  createdAt: number;
  attempts: number;
  status: CollectionStatus;
  failureReason?: string;
}

/** One netted debit: every pending item for a single user/account/currency. */
export interface SweepBatch {
  userId: string;
  sourceId: string;
  source: PaymentSource;
  currency: CurrencyCode;
  /** Sum of every item in the batch, in the source's own currency. */
  totalInSourceCurrency: number;
  totalInSettlementCurrency: number;
  itemIds: string[];
}

export interface SweepReport {
  batches: number;
  itemsCollected: number;
  itemsFailed: number;
  /** Debits actually issued — one per batch. */
  debitsIssued: number;
  /** Debits an inline (un-netted) strategy would have issued. */
  debitsAvoided: number;
  /** Money saved by netting, in settlement currency. */
  costSaved: number;
}

export class CollectionQueue {
  private readonly items = new Map<string, CollectionItem>();
  private readonly storageKey: string | null;

  /**
   * @param storageKey persist under this key. Null keeps the queue in memory,
   * which is what tests want. The app's shared queue always persists: an
   * uncollected leg is money the float has already paid out, and losing it on
   * a restart means it is never recovered.
   */
  constructor(storageKey: string | null = null) {
    this.storageKey = storageKey;
    if (storageKey) {
      const saved = read<CollectionItem[]>(storageKey);
      if (saved) for (const item of saved) this.items.set(item.id, item);
    }
  }

  private save(): void {
    if (this.storageKey) write(this.storageKey, [...this.items.values()]);
  }

  /** Queue a leg for later collection. The payee is already paid. */
  enqueue(input: {
    transactionId: string;
    userId: string;
    leg: FundingLeg;
    now: number;
  }): CollectionItem {
    const item: CollectionItem = {
      id: nextId('col'),
      transactionId: input.transactionId,
      userId: input.userId,
      sourceId: input.leg.sourceId,
      source: input.leg.source,
      amountInSourceCurrency: input.leg.amountInSourceCurrency,
      currency: input.leg.sourceCurrency,
      amountInSettlementCurrency: input.leg.amountInSettlementCurrency,
      createdAt: input.now,
      attempts: 0,
      status: 'pending',
    };
    this.items.set(item.id, item);
    this.save();
    return item;
  }

  pending(userId?: string): CollectionItem[] {
    return [...this.items.values()].filter(
      (item) => item.status === 'pending' && (!userId || item.userId === userId)
    );
  }

  get(id: string): CollectionItem | undefined {
    return this.items.get(id);
  }

  all(): readonly CollectionItem[] {
    return [...this.items.values()];
  }

  /**
   * Group everything pending into one batch per (user, account, currency).
   *
   * The grouping key is what determines the saving: anything that can be
   * pulled in a single debit must land in the same batch.
   */
  buildBatches(userId?: string): SweepBatch[] {
    const groups = new Map<string, SweepBatch>();

    for (const item of this.pending(userId)) {
      const key = `${item.userId}|${item.sourceId}|${item.currency}`;
      const existing = groups.get(key);

      if (existing) {
        existing.totalInSourceCurrency = roundCurrency(
          existing.totalInSourceCurrency + item.amountInSourceCurrency,
          item.currency
        );
        existing.totalInSettlementCurrency = roundCurrency(
          existing.totalInSettlementCurrency + item.amountInSettlementCurrency,
          'NGN'
        );
        existing.itemIds.push(item.id);
      } else {
        groups.set(key, {
          userId: item.userId,
          sourceId: item.sourceId,
          source: item.source,
          currency: item.currency,
          totalInSourceCurrency: item.amountInSourceCurrency,
          totalInSettlementCurrency: item.amountInSettlementCurrency,
          itemIds: [item.id],
        });
      }
    }

    return [...groups.values()];
  }

  markCollected(itemIds: string[]): void {
    for (const id of itemIds) {
      const item = this.items.get(id);
      if (!item) continue;
      item.status = 'collected';
      item.attempts += 1;
    }
    this.save();
  }

  markFailed(itemIds: string[], reason: string, retryLimit: number): void {
    for (const id of itemIds) {
      const item = this.items.get(id);
      if (!item) continue;
      item.attempts += 1;
      item.failureReason = reason;
      // Stays pending so the next sweep retries it, until retries run out.
      item.status = item.attempts >= retryLimit ? 'escalated' : 'pending';
    }
    this.save();
  }
}

export interface SweepDeps {
  queue: CollectionQueue;
  rails: RailRegistry;
  /** Called per successfully collected batch, to release treasury exposure. */
  onCollected?: (batch: SweepBatch) => void;
  onFailed?: (batch: SweepBatch, reason: string) => void;
  retryLimit?: number;
  now?: () => number;
}

/**
 * Run one collection sweep: one debit per account, covering everything that
 * account owes across every payment since the last sweep.
 */
export async function runCollectionSweep(
  deps: SweepDeps,
  userId?: string
): Promise<SweepReport> {
  const now = deps.now ?? Date.now;
  const retryLimit = deps.retryLimit ?? TreasuryConfig.collectionRetryLimit;
  const batches = deps.queue.buildBatches(userId);

  const report: SweepReport = {
    batches: batches.length,
    itemsCollected: 0,
    itemsFailed: 0,
    debitsIssued: 0,
    debitsAvoided: 0,
    costSaved: 0,
  };

  for (const batch of batches) {
    const rail = deps.rails.resolve(batch.source);
    const idempotencyKey = `sweep:${batch.userId}:${batch.sourceId}:${batch.itemIds.join(',')}`;

    report.debitsIssued += 1;
    // One debit replaced this many.
    const avoided = batch.itemIds.length - 1;
    report.debitsAvoided += avoided;
    report.costSaved = roundCurrency(
      report.costSaved +
        nettingSaving(
          batch.itemIds.length,
          1,
          collectionCost(batch.source, batch.totalInSettlementCurrency)
        ),
      'NGN'
    );

    const held = await rail.hold({
      legId: idempotencyKey,
      source: batch.source,
      amountInSourceCurrency: batch.totalInSourceCurrency,
      currency: batch.currency,
      idempotencyKey: `${idempotencyKey}:hold`,
      ttlMs: DEFAULT_HOLD_TTL_MS,
    });

    if (!held.ok) {
      deps.queue.markFailed(batch.itemIds, held.reason, retryLimit);
      deps.onFailed?.(batch, held.reason);
      report.itemsFailed += batch.itemIds.length;
      continue;
    }

    const captured = await rail.capture({
      legId: idempotencyKey,
      source: batch.source,
      holdRef: held.holdRef,
      amountInSourceCurrency: batch.totalInSourceCurrency,
      idempotencyKey: `${idempotencyKey}:capture`,
    });

    if (!captured.ok) {
      await rail.release({
        legId: idempotencyKey,
        source: batch.source,
        holdRef: held.holdRef,
        idempotencyKey: `${idempotencyKey}:release`,
      });
      deps.queue.markFailed(batch.itemIds, captured.reason, retryLimit);
      deps.onFailed?.(batch, captured.reason);
      report.itemsFailed += batch.itemIds.length;
      continue;
    }

    deps.queue.markCollected(batch.itemIds);
    deps.onCollected?.(batch);
    report.itemsCollected += batch.itemIds.length;
  }

  void now;
  return report;
}

/** The app's queue. Persisted — see the constructor for why. */
export const collectionQueue = new CollectionQueue(StorageKeys.collections);
