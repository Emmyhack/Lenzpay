import type { CurrencyCode, PaymentSource } from '@/types/payment';
import type {
  ExecutionResult,
  FundingPlan,
  LockedPlan,
  Payee,
  PlanResult,
  PrepareResult,
} from '@/types/orchestration';
import { Config } from '@/constants/config';
import { devRateFeed, type NgnRateTable, type RateFeed } from './fx';
import { planPayment, type PlanOptions } from './planner';
import { executePlan, strategyForLocked, type ExecutorDeps } from './executor';
import {
  preparePlan,
  releaseLockedPlan,
  toFundingPlan,
  type BalanceProvider,
  type PrepareDeps,
  type ReleaseOutcome,
} from './prepare';
import { CapabilityRegistry, capabilityRegistry } from './capabilities';
import { Ledger, ledger } from './ledger';
import { IdempotencyStore } from './idempotency';
import { Treasury, treasury } from './treasury';
import { StorageKeys } from '@/services/persistence';
import { CollectionQueue, collectionQueue, runCollectionSweep, type SweepReport } from './collections';
import {
  createDevRailRegistry,
  createMockSettlementRail,
  type RailRegistry,
  type SettlementRail,
} from './rails';

/**
 * The configured Funding Orchestration Engine the app talks to.
 *
 * Everything below the facade is injectable, which is what lets the test suite
 * drive the same code paths with deterministic rails and clocks. The app only
 * needs two verbs: `plan` (pure, safe to call on every keystroke) and
 * `execute` (moves money, exactly once per idempotency key).
 */

// ---------------------------------------------------------------------------
// Live rate feed
// ---------------------------------------------------------------------------

let currentFeed: RateFeed = devRateFeed();

/**
 * Push fresh rates in from whatever is polling them (`useFXRates`). Keeping
 * this as a module-level value rather than React state means the planner and
 * executor can stay plain functions, callable outside the component tree.
 */
export function updateRateFeed(rates: Partial<NgnRateTable>, updatedAt = Date.now()): void {
  currentFeed = { rates: { ...currentFeed.rates, ...rates }, updatedAt };
}

export function getRateFeed(): RateFeed {
  return currentFeed;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface EngineConfig {
  rails: RailRegistry;
  settlementRail: SettlementRail;
  ledger: Ledger;
  idempotency: IdempotencyStore<ExecutionResult>;
  treasury: Treasury;
  collections: CollectionQueue;
  /** What each connected source can do. Consulted before planning, not after. */
  capabilities: CapabilityRegistry;
  /**
   * Live balance access for `prepare()`. Absent means float-backed legs are
   * verified against the balance the plan was built from — fine in
   * development, an unverified credit decision in production.
   */
  balances?: BalanceProvider;
}

function defaultConfig(): EngineConfig {
  return {
    // In mock mode, a small random hold-failure rate keeps the rollback and
    // retry UI reachable during development. Real rails replace this wholesale.
    rails: createDevRailRegistry(
      Config.useMockData
        ? {
            bank: { id: 'bank_aggregator', latencyMs: 260, holdFailureRate: 0.04 },
            wallet: {
              id: 'wallet_provider',
              latencyMs: 200,
              supportsNativeHold: false,
              holdFailureRate: 0.03,
            },
            usd: { id: 'fx_partner', latencyMs: 340, holdFailureRate: 0.03 },
            crypto: { id: 'crypto_custody', latencyMs: 520, holdFailureRate: 0.05 },
          }
        : {}
    ),
    settlementRail: createMockSettlementRail({ latencyMs: Config.useMockData ? 400 : 0 }),
    ledger,
    // Persisted: a retry after a restart must replay, not re-charge.
    idempotency: new IdempotencyStore<ExecutionResult>(
      24 * 60 * 60 * 1000,
      StorageKeys.idempotency
    ),
    treasury,
    collections: collectionQueue,
    capabilities: capabilityRegistry,
  };
}

let config: EngineConfig = defaultConfig();

/** Swap the engine's dependencies — used by tests and by the real backend wiring. */
export function configureEngine(next: Partial<EngineConfig>): void {
  config = { ...config, ...next };
}

export const paymentEngine = {
  /**
   * Build a funding plan. Pure and side-effect free — safe to call on every
   * amount keystroke to keep the preview live.
   */
  plan(
    sources: PaymentSource[],
    amount: number,
    currency: CurrencyCode = 'NGN',
    options: PlanOptions = {}
  ): PlanResult {
    return planPayment(sources, amount, currency, getRateFeed(), options);
  },

  /**
   * Commit a plan: re-lock rates, authorise what can be authorised, verify
   * what cannot, and obtain float cover for the remainder.
   *
   * This is where every external side effect lives, which is precisely what
   * keeps `plan()` safe to call on every keystroke. Returns a `LockedPlan` —
   * the immutable object the confirmation screen renders and `execute()` runs.
   */
  prepare(plan: FundingPlan, userId: string, idempotencyKey: string): Promise<PrepareResult> {
    const deps: PrepareDeps = {
      rails: config.rails,
      feed: getRateFeed(),
      treasury: config.treasury,
      capabilities: config.capabilities,
      balances: config.balances,
    };
    return preparePlan({ plan, userId, idempotencyKey }, deps);
  },

  /**
   * Execute a plan. Moves money exactly once per idempotency key.
   *
   * Accepts a `LockedPlan` — the intended path, since a prepared plan carries
   * real per-leg guarantees and the strategy can be read off them rather than
   * guessed from the rails. A bare `FundingPlan` is still accepted so callers
   * that have not adopted `prepare()` keep working; those infer the strategy
   * from rail capability as before.
   */
  execute(
    plan: FundingPlan | LockedPlan,
    payee: Payee,
    idempotencyKey: string,
    userId: string
  ): Promise<ExecutionResult> {
    const deps: ExecutorDeps = {
      rails: config.rails,
      settlementRail: config.settlementRail,
      ledger: config.ledger,
      feed: getRateFeed(),
      idempotency: config.idempotency,
      treasury: config.treasury,
      collections: config.collections,
    };

    if (isLocked(plan)) {
      return executePlan(
        {
          plan: toFundingPlan(plan),
          payee,
          idempotencyKey,
          userId,
          strategy: strategyForLocked(plan),
        },
        deps
      );
    }

    return executePlan({ plan, payee, idempotencyKey, userId }, deps);
  },

  /**
   * Give back everything a prepared plan is holding.
   *
   * Because `prepare()` runs when the user reaches the confirmation screen,
   * real authorisations exist before they authenticate. If they cancel or
   * navigate away, those holds must be released rather than left to expire —
   * otherwise the user is left unable to spend money on a payment they
   * explicitly declined. Idempotent, so an unmount handler may call it twice.
   */
  abandon(locked: LockedPlan, idempotencyKey: string): Promise<ReleaseOutcome> {
    return releaseLockedPlan(locked, { rails: config.rails }, idempotencyKey);
  },

  /** What every connected source can actually do, for diagnostics and UI. */
  capabilities(): CapabilityRegistry {
    return config.capabilities;
  },

  ledger(): Ledger {
    return config.ledger;
  },

  treasury(): Treasury {
    return config.treasury;
  },

  collections(): CollectionQueue {
    return config.collections;
  },

  /**
   * Run the collection sweep: one debit per account covering everything it
   * owes.
   *
   * **This must never be the production trigger.** Collection cannot depend on
   * a client being open — a user who stops opening the app would simply never
   * be debited, turning float exposure into a permanent loss. In production a
   * scheduled backend job owns this on `Treasury.sweepIntervalMs`; the method
   * exists so the netting can be exercised and measured in development, and it
   * refuses to run outside it.
   *
   * The backend job's contract is exactly this call: idempotent per batch,
   * safe to re-run, and safe to run concurrently with payments because
   * `buildBatches` only picks up items already queued.
   */
  sweepCollections(userId?: string): Promise<SweepReport> {
    if (!__DEV__ && !Config.useMockData) {
      return Promise.reject(
        new Error(
          'Collection sweeps are a scheduled backend job. A client-triggered sweep would mean users who stop opening the app are never debited.'
        )
      );
    }

    return runCollectionSweep(
      {
        queue: config.collections,
        rails: config.rails,
        onCollected: (batch) =>
          config.treasury.recover(batch.userId, batch.totalInSettlementCurrency),
      },
      userId
    );
  },
};

/** A prepared plan carries a guarantee per leg; a raw plan does not. */
function isLocked(plan: FundingPlan | LockedPlan): plan is LockedPlan {
  return 'weakestGuarantee' in plan && 'planId' in plan;
}
