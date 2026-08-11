/**
 * Funding Orchestration Engine — public surface.
 *
 * §5 of the product spec, in code:
 *   ranking.ts   — §5.2 source ranking (priority_score)
 *   planner.ts   — §5.3 single-source fast path, §5.4 the waterfall "scrape"
 *   executor.ts  — §5.4 hold-then-capture, §5.7 failure and rollback
 *   fx.ts        — §5.5 rate locks, fee schedule, re-quote tolerance
 *   ledger.ts    — §6.1 double-entry ledger and per-leg audit trail
 *   rails.ts     — §6.1 rail adapters (bank / FX / crypto / payout)
 */

export { paymentEngine, configureEngine, getRateFeed, updateRateFeed } from './engine';
export type { EngineConfig } from './engine';

export {
  planPayment,
  planBalances,
  planIsExpired,
  planRequiresConversion,
  summarisePlan,
} from './planner';
export type { PlanOptions } from './planner';

export { rankSources, totalAvailable, partitionByReserve } from './ranking';

export { executePlan, chooseStrategy, describeLegs } from './executor';
export type { ExecutorDeps, ExecuteParams } from './executor';

export {
  CURRENCY_SYMBOL,
  devRateFeed,
  formatRateLine,
  getQuote,
  isQuoteExpired,
  msUntilExpiry,
  requote,
  toSettlement,
  fromSettlement,
  legFee,
} from './fx';
export type { RateFeed, NgnRateTable, FeeTerms } from './fx';

export {
  Ledger,
  ledger,
  legPostings,
  sourceToFloatPostings,
  floatToPayeePostings,
  reversalPostings,
  UnbalancedPostingError,
} from './ledger';

export { IdempotencyStore, deriveIdempotencyKey } from './idempotency';

export { Treasury, treasury, collectionConfidence } from './treasury';

export {
  CollectionQueue,
  collectionQueue,
  runCollectionSweep,
} from './collections';
export type { CollectionItem, SweepBatch, SweepReport } from './collections';

export {
  RAIL_COSTS,
  collectionCost,
  minimumViableLeg,
  planCollectionCost,
  nettingSaving,
} from './costs';
export type { RailCostTerms } from './costs';
export type { FloatExposure, FrontDecision, TreasuryLimits } from './treasury';

export {
  RailRegistry,
  createDevRailRegistry,
  createMockRail,
  createMockSettlementRail,
} from './rails';
export type { RailAdapter, SettlementRail, MockRailConfig } from './rails';
