import type { CurrencyCode, PaymentSource } from '@/types/payment';
import type { ExecutionResult, FundingPlan, Payee, PlanResult } from '@/types/orchestration';
import { Config } from '@/constants/config';
import { devRateFeed, type NgnRateTable, type RateFeed } from './fx';
import { planPayment, type PlanOptions } from './planner';
import { executePlan, type ExecutorDeps } from './executor';
import { Ledger, ledger } from './ledger';
import { IdempotencyStore } from './idempotency';
import { Treasury, treasury } from './treasury';
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
    idempotency: new IdempotencyStore<ExecutionResult>(),
    treasury,
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

  /** Execute a plan. Moves money exactly once per idempotency key. */
  execute(
    plan: FundingPlan,
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
    };
    return executePlan({ plan, payee, idempotencyKey, userId }, deps);
  },

  ledger(): Ledger {
    return config.ledger;
  },

  treasury(): Treasury {
    return config.treasury;
  },
};
