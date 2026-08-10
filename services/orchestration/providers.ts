import type { SourceType } from '@/types/payment';
import type { RailAdapter } from './rails';

/**
 * The provider stack, and — more importantly — what each provider can actually
 * do.
 *
 * The engine never asks "which vendor is this?". It asks "can this rail hold
 * funds without moving them?" and picks a settlement strategy from the answer
 * (`chooseStrategy` in `executor.ts`). Capabilities are therefore declared
 * here as data, so swapping a provider is a config change rather than an
 * engine change — and so the consequences of a provider's limitations are
 * visible in one place instead of discovered in production.
 *
 * Nothing here calls a real API yet. These are the contracts each integration
 * must satisfy, plus the reasoning for why each was chosen. See
 * `docs/ARCHITECTURE-DECISIONS.md` for the full rationale.
 */

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  /**
   * Can the rail authorise funds without moving them? This single flag decides
   * whether §5.4's hold-then-capture is available or whether the payment has
   * to be float-fronted.
   */
  nativeHold: boolean;
  /** Can a completed debit be reversed programmatically? */
  programmaticRefund: boolean;
  /** Can we read a live balance, or only attempt a debit and see? */
  balanceRead: boolean;
  /** Typical settlement latency, used for float exposure planning. */
  typicalSettlementMs: number;
}

export interface ProviderProfile {
  id: string;
  displayName: string;
  /** Which funding-source types this provider serves. */
  serves: SourceType[];
  capabilities: ProviderCapabilities;
  /** Why this provider, and what we accept by choosing it. */
  rationale: string;
  /** What has to be true before this can carry real money. */
  blockers: string[];
}

// ---------------------------------------------------------------------------
// The chosen stack
// ---------------------------------------------------------------------------

/**
 * Bank account aggregation — balance reads plus debit initiation.
 *
 * Chosen: an Open Banking aggregator, *not* a direct NIBSS integration.
 * Direct NIBSS access requires licensing Lenz Pay does not have and would gate
 * the entire MVP behind a regulatory process measured in quarters. An
 * aggregator that offers both account linking and direct debit covers the two
 * capabilities the engine needs from a single integration.
 *
 * The critical, non-negotiable fact: **neither NIBSS NIP nor a direct-debit
 * mandate offers authorise-then-capture.** A debit either happens or doesn't.
 * That is why `nativeHold` is false, and why the float exists.
 */
export const BANK_AGGREGATOR: ProviderProfile = {
  id: 'bank_aggregator',
  displayName: 'Open Banking aggregator (primary)',
  serves: ['bank'],
  capabilities: {
    nativeHold: false,
    programmaticRefund: false,
    balanceRead: true,
    typicalSettlementMs: 30_000,
  },
  rationale:
    'Single integration covering both balance reads and debit initiation, without the licensing burden of direct NIBSS access. Push/pull rails have no authorisation step, so multi-account payments are float-fronted.',
  blockers: [
    'Commercial agreement and production API keys',
    'A licensed PSP partner of record for the debit rails (§7)',
    'Confirm per-bank debit coverage — reachability varies by institution',
  ],
};

/**
 * Second aggregator, deliberately planned from day one.
 *
 * Single-aggregator dependency is a live risk in this market: providers exit,
 * and bank-by-bank reachability differs between them. `RailRegistry` already
 * supports per-source overrides, so a source can be pinned to whichever
 * aggregator actually reaches its bank.
 */
export const BANK_AGGREGATOR_SECONDARY: ProviderProfile = {
  id: 'bank_aggregator_secondary',
  displayName: 'Open Banking aggregator (fallback)',
  serves: ['bank', 'wallet'],
  capabilities: {
    nativeHold: false,
    programmaticRefund: false,
    balanceRead: true,
    typicalSettlementMs: 45_000,
  },
  rationale:
    'Coverage gap-filling and failover. Registered per-source so a bank the primary cannot reach still works, and so a primary outage is not a total outage.',
  blockers: ['Secondary commercial agreement', 'Per-source routing table'],
};

/**
 * Foreign-currency accounts and the FX leg.
 *
 * Chosen: **pure pass-through** via a licensed FX partner. Lenz Pay quotes the
 * partner's rate plus a disclosed markup (`feeScheduleFor` in `fx.ts`) and
 * never holds a currency position of its own.
 *
 * Running an own book would mean inventory risk, an FX licensing path, and
 * treasury capability that has nothing to do with the product's actual
 * innovation. The markup is the revenue; the position is the partner's.
 */
export const FX_PARTNER: ProviderProfile = {
  id: 'fx_partner',
  displayName: 'Licensed FX partner (pass-through)',
  serves: ['usd'],
  capabilities: {
    // FX partners typically *can* lock a quote and settle against it, which is
    // what makes the rate lock in §5.5 enforceable rather than aspirational.
    nativeHold: true,
    programmaticRefund: true,
    balanceRead: true,
    typicalSettlementMs: 120_000,
  },
  rationale:
    'No own FX book: no inventory risk, no FX licence on the critical path. Lenz earns a disclosed spread over the partner quote rather than trading against customers.',
  blockers: [
    'Partner quote API with a firm rate-lock window (≥45s to match Orchestration.rateLockWindowMs)',
    'Confirm the partner honours a locked quote on settlement, not just on quote',
  ],
};

/**
 * Crypto balances and the conversion leg.
 *
 * Chosen: **custody-as-a-service through a licensed VASP** — not self-custody
 * by Lenz, and not non-custodial wallet linking.
 *
 * - Self-custody would make Lenz a VASP, which §7 explicitly says to avoid
 *   pre-licence.
 * - Non-custodial linking sounds safer but breaks the product: every payment
 *   would need a wallet signature mid-flow, which kills the "just works" UX
 *   and makes a crypto leg inside a waterfall essentially unusable.
 *
 * A licensed partner holding the balance in the user's name, with Lenz holding
 * debit authority, gets custodial UX without Lenz taking custody or the
 * licence burden. Crypto is Phase 4, so this decision has runway to be
 * revisited against whatever the licensing landscape looks like then.
 */
export const CRYPTO_CUSTODY: ProviderProfile = {
  id: 'crypto_custody',
  displayName: 'Licensed VASP custody partner',
  serves: ['crypto'],
  capabilities: {
    nativeHold: true,
    programmaticRefund: true,
    balanceRead: true,
    // Conversion plus off-ramp is the slowest leg in the stack — which is
    // exactly why it must not be the thing the payee waits on.
    typicalSettlementMs: 300_000,
  },
  rationale:
    'Custodial UX without Lenz holding customer crypto or needing a VASP licence. The conversion and off-ramp legs stay inside the licensed partner.',
  blockers: [
    'VASP partner with SEC Nigeria standing — verify current registration status directly, it moves',
    'Off-ramp settlement SLA; the float must cover the gap, not the payee',
  ],
};

export const PROVIDER_STACK: ProviderProfile[] = [
  BANK_AGGREGATOR,
  BANK_AGGREGATOR_SECONDARY,
  FX_PARTNER,
  CRYPTO_CUSTODY,
];

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * Factory a real integration must provide. Implementations translate the
 * three-verb rail contract into provider API calls, and must report
 * `supportsNativeHold` truthfully — overstating it is the one lie that would
 * silently reintroduce partial-charge risk.
 */
export type ProviderAdapterFactory = (config: ProviderRuntimeConfig) => RailAdapter;

export interface ProviderRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret?: string;
  /** Set false in staging to route to the provider's sandbox. */
  live: boolean;
}

export function profileFor(providerId: string): ProviderProfile | undefined {
  return PROVIDER_STACK.find((profile) => profile.id === providerId);
}

/**
 * Everything still standing between the stack and real money. Surfaced as data
 * so it can be asserted on in a launch-readiness check rather than living in a
 * document nobody reads.
 */
export function outstandingBlockers(): { provider: string; blocker: string }[] {
  return PROVIDER_STACK.flatMap((profile) =>
    profile.blockers.map((blocker) => ({ provider: profile.displayName, blocker }))
  );
}
