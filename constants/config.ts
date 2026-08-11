/**
 * App-wide configuration: API base URL, feature flags, transaction limits.
 * Values here are dev defaults — wire real values through EAS environment
 * variables (app.json `extra` + expo-constants) before shipping.
 */
export const Config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.lenzpay.app',
  useMockData: true, // flip to false once services/* hit a real backend
  fxPollIntervalMs: 30_000,
  kycPollIntervalMs: 5_000,
} as const;

/**
 * Which regulatory posture the product is operating under.
 *
 * This is the single switch for "what are we licensed to do today". It is a
 * licensing concept before it is a product one: each phase is defined by whose
 * licence the money moves on, and that determines whether we may hold a float
 * — which in turn determines whether multi-source payments are possible at all.
 *
 * - `partner_tsp`   Launch. Lenz is a Technical Service Provider instructing a
 *                   licensed aggregator's debits and a licensed PSP's payouts.
 *                   Lenz never holds funds and never fronts money, so there is
 *                   no float, no credit exposure, and no CBN licence of our
 *                   own. Single-source payments only — a multi-source payment
 *                   has no way to be atomic without a float, and the engine
 *                   refuses rather than debit several accounts unprotected.
 *
 * - `partner_float` Smart Split unlocks. The float is operated by the partner
 *                   PSP on *their* licence and collateralised by us. Legally
 *                   theirs, economically ours. This is also what makes netted
 *                   collection possible, which is what makes splitting
 *                   affordable — the two unlock together.
 *
 * - `own_licence`   Lenz holds its own PSSP/switching licence and operates its
 *                   own float. Higher leg ceiling, no partner margin.
 *
 * The float-as-credit question is the one to get counsel on before moving to
 * `partner_float`; see docs/ARCHITECTURE-DECISIONS.md (ADR-004).
 */
export type LaunchPhase = 'partner_tsp' | 'partner_float' | 'own_licence';

export const ACTIVE_PHASE: LaunchPhase = 'partner_float';

interface PhasePolicy {
  /** May we front money to settle before collecting? */
  floatEnabled: boolean;
  /** Ceiling on waterfall legs. Each leg costs a fixed debit fee. */
  maxWaterfallLegs: number;
  /** Defer collection and net it per account, instead of debiting per leg. */
  nettedCollection: boolean;
  /** Whose books the float sits on — surfaces in the ledger's account refs. */
  floatOwner: string;
  /** Smart Split is only safe where atomicity can be guaranteed. */
  smartSplitEnabled: boolean;
}

const PHASE_POLICY: Record<LaunchPhase, PhasePolicy> = {
  partner_tsp: {
    floatEnabled: false,
    maxWaterfallLegs: 1,
    nettedCollection: false,
    floatOwner: 'partner_psp',
    smartSplitEnabled: false,
  },
  partner_float: {
    floatEnabled: true,
    // Two, not four. Every extra leg is another fixed debit fee against a
    // payment that is already small — see the cost model in orchestration/costs.
    maxWaterfallLegs: 2,
    nettedCollection: true,
    floatOwner: 'partner_psp',
    smartSplitEnabled: true,
  },
  own_licence: {
    floatEnabled: true,
    maxWaterfallLegs: 4,
    nettedCollection: true,
    floatOwner: 'lenz',
    smartSplitEnabled: true,
  },
};

export const Phase: PhasePolicy = PHASE_POLICY[ACTIVE_PHASE];

export function policyFor(phase: LaunchPhase): PhasePolicy {
  return PHASE_POLICY[phase];
}

export const FeatureFlags = {
  smartSplitEnabled: Phase.smartSplitEnabled,
  cryptoSourcesEnabled: true,
  merchantAppEnabled: true,
} as const;

/**
 * Funding Orchestration Engine tuning (§5).
 *
 * `rankingWeights` are the coefficients of the priority_score sum in §5.2.
 * Each contributing term is normalised to 0..1 before weighting, so these
 * numbers are directly comparable to one another.
 */
export const Orchestration = {
  /** How long a quoted FX/crypto rate stays honoured (§5.5 says 30–60s). */
  rateLockWindowMs: 45_000,
  /** Silent re-quote allowed within this drift; beyond it, re-prompt the user. */
  rateDriftTolerance: 0.005, // ±0.5%
  /** Max legs in one waterfall. Driven by the licensing phase, not tuned here. */
  maxWaterfallLegs: Phase.maxWaterfallLegs,
  /**
   * A leg must clear this multiple of its own collection cost to be worth
   * adding. At 2x, a leg costing ₦55 to debit must deliver at least ₦110 —
   * otherwise the waterfall is spending more on fees than it moves.
   */
  minLegCostRatio: 2,
  /** Absolute floor regardless of cost, in settlement currency. */
  minLegAmount: 1,
  /** How long a placed hold stays valid before the rail auto-releases it. */
  holdTtlMs: 120_000,

  rankingWeights: {
    userPriority: 3.0,
    currencyProximity: 2.5,
    conversionCost: 2.0,
    reliability: 1.5,
    /** Subtracted outright when a source is flagged as reserve funds. */
    reservePenalty: 10.0,
  },
} as const;

/**
 * Settlement float / treasury policy.
 *
 * Nigerian bank rails settle by push (NIBSS NIP) or pull (direct-debit
 * mandate); neither offers authorise-then-capture. So for the MVP corridor the
 * hold primitive §5.4 relies on simply does not exist, and the atomicity has to
 * come from somewhere else: Lenz Pay's own float pays the payee in one
 * indivisible operation, then collects from the user's accounts afterwards.
 *
 * That inverts who carries the risk — from "user might get charged three times
 * for a failed payment" to "Lenz might not collect on a payment it already
 * made." The limits below are what bound the second risk.
 */
export const Treasury = {
  /** Driven by the licensing phase — see LaunchPhase above. */
  floatEnabled: Phase.floatEnabled,
  /** Whose licence the float sits on. Recorded in ledger account refs. */
  floatOwner: Phase.floatOwner,
  /**
   * Defer collection and net it per account instead of debiting per leg.
   *
   * This is the difference between paying a fixed debit fee per leg per
   * payment, and paying it once per account per sweep. For an active user it
   * is a multiple, not a margin — and it is only possible because the float
   * already decouples paying the payee from collecting the money.
   */
  nettedCollection: Phase.nettedCollection,
  /** How often the collection sweep runs. */
  sweepIntervalMs: 24 * 60 * 60 * 1000,
  /** Largest single payment the float will front. */
  perTransactionNGN: 200_000,
  /** Most one user may owe the float across all in-flight payments. */
  perUserOutstandingNGN: 500_000,
  /** Total float exposure across all users — the treasury's hard ceiling. */
  globalOutstandingNGN: 50_000_000,
  /**
   * Minimum collection confidence (0..1) required to front float, derived from
   * source reliability and how recently balances were verified.
   */
  minCollectionConfidence: 0.9,
  /** Balances older than this are treated as unverified when scoring confidence. */
  balanceFreshnessMs: 5 * 60_000,
  /** Collection attempts before a leg is escalated for manual recovery. */
  collectionRetryLimit: 3,
} as const;

export const TransactionLimits = {
  defaultDailyLimitNGN: 500_000,
  defaultPerTxnLimitNGN: 200_000,
  skipPinBelowNGN: 500,
} as const;
