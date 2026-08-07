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

export const TransactionLimits = {
  defaultDailyLimitNGN: 500_000,
  defaultPerTxnLimitNGN: 200_000,
  skipPinBelowNGN: 500,
} as const;
