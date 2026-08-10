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

export const FeatureFlags = {
  smartSplitEnabled: true,
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
  /** Max legs in one waterfall — beyond this the UX and fraud risk degrade. */
  maxWaterfallLegs: 4,
  /** Sources contributing less than this (settlement currency) are skipped. */
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
  /** Master switch. Off ⇒ multi-leg payments require true holds (§5.4). */
  floatEnabled: true,
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
