import type { PaymentSource, SourceType } from '@/types/payment';
import { DEFAULT_RELIABILITY } from '@/types/payment';
import type {
  BalanceVisibility,
  GuaranteeKind,
  SourceCapabilities,
} from '@/types/orchestration';

/**
 * Source Capability Registry — what every connected account can actually *do*,
 * resolved before a plan is built rather than discovered while executing one.
 *
 * The engine previously modelled this with a single boolean on the rail
 * adapter (`supportsNativeHold`) and consulted it only after planning, in
 * `chooseStrategy`. That ordering is backwards. Whether a source can authorise,
 * whether it will disclose a balance, whether spending it needs a user
 * signature — these change *which accounts should be chosen*, not merely how
 * the chosen ones get executed.
 *
 * Concretely, this is the difference between:
 *
 *     "who has enough money?"                    (balance-aware)
 *     "which combination is safest to execute?"  (capability-aware)
 *
 * A card that cannot report a balance but can place a real hold may be a
 * better leg than a bank account whose balance we can read but never lock —
 * and only a planner that knows both facts up front can make that trade.
 */

// ---------------------------------------------------------------------------
// Rail profiles
// ---------------------------------------------------------------------------

/**
 * Baseline capabilities per source type.
 *
 * These are the honest defaults for the Nigerian corridor as it exists today
 * (see docs/ARCHITECTURE-DECISIONS.md, ADR-000): bank rails can be read and
 * debited but *not* held, which is the single fact that forces the float.
 * Providers that genuinely offer more override per source.
 */
const RAIL_PROFILES: Record<SourceType, SourceCapabilities> = {
  /**
   * Open Banking direct debit. Balance is readable, the debit is a single-shot
   * pull, and there is no authorisation step to hold against.
   */
  bank: {
    rail: 'DIRECT_DEBIT',
    balanceVisibility: 'exact',
    debitSupported: true,
    holdSupported: false,
    captureSupported: false,
    releaseSupported: false,
    refundSupported: false,
    reversible: 'limited',
    requiresUserSignature: false,
    delegatedSpend: true,
    delegatedLimit: null,
    reserveSupported: false,
    settlementLatencyMs: 30_000,
    failureRate: 0.04,
  },

  /** Wallet APIs debit outright. Same shape as a bank, cheaper and faster. */
  wallet: {
    rail: 'WALLET',
    balanceVisibility: 'exact',
    debitSupported: true,
    holdSupported: false,
    captureSupported: false,
    releaseSupported: false,
    refundSupported: true,
    reversible: 'limited',
    requiresUserSignature: false,
    delegatedSpend: true,
    delegatedLimit: null,
    reserveSupported: false,
    settlementLatencyMs: 8_000,
    failureRate: 0.03,
  },

  /**
   * A domiciliary/FX partner account we can genuinely ring-fence against.
   * This is one of the two rails where §5.4's hold-then-capture is real.
   */
  usd: {
    rail: 'CUSTODY',
    balanceVisibility: 'exact',
    debitSupported: true,
    holdSupported: true,
    captureSupported: true,
    releaseSupported: true,
    refundSupported: true,
    reversible: 'full',
    requiresUserSignature: false,
    delegatedSpend: true,
    delegatedLimit: null,
    reserveSupported: true,
    settlementLatencyMs: 15_000,
    failureRate: 0.02,
  },

  /** Explicit custody account — same capabilities as `usd`, named honestly. */
  custody: {
    rail: 'CUSTODY',
    balanceVisibility: 'exact',
    debitSupported: true,
    holdSupported: true,
    captureSupported: true,
    releaseSupported: true,
    refundSupported: true,
    reversible: 'full',
    requiresUserSignature: false,
    delegatedSpend: true,
    delegatedLimit: null,
    reserveSupported: true,
    settlementLatencyMs: 12_000,
    failureRate: 0.015,
  },

  /**
   * On-chain wallet. Balance reading is trivially available from a public
   * address, but *spending* needs a key we do not hold — so by default every
   * payment needs a signature, and a transfer once broadcast is irreversible.
   * An embedded wallet with a standing allowance overrides `delegatedSpend`.
   */
  crypto: {
    rail: 'ONCHAIN',
    balanceVisibility: 'exact',
    debitSupported: true,
    holdSupported: false,
    captureSupported: false,
    releaseSupported: false,
    refundSupported: false,
    reversible: 'none',
    requiresUserSignature: true,
    delegatedSpend: false,
    delegatedLimit: null,
    reserveSupported: false,
    settlementLatencyMs: 45_000,
    failureRate: 0.03,
  },

  /**
   * Card acquiring. The inverse of a bank account: we learn nothing about the
   * balance, but preauthorise → capture → release is a real primitive, so a
   * card leg can carry a genuine guarantee that no Nigerian bank leg can.
   */
  card: {
    rail: 'CARD',
    balanceVisibility: 'none',
    debitSupported: true,
    holdSupported: true,
    captureSupported: true,
    releaseSupported: true,
    refundSupported: true,
    reversible: 'full',
    requiresUserSignature: false,
    delegatedSpend: true,
    delegatedLimit: null,
    reserveSupported: false,
    settlementLatencyMs: 3_000,
    failureRate: 0.05,
  },
};

/** The baseline profile for a source type, before per-source overrides. */
export function railProfile(type: SourceType): SourceCapabilities {
  return { ...RAIL_PROFILES[type] };
}

// ---------------------------------------------------------------------------
// Derived properties
// ---------------------------------------------------------------------------

export function balanceReadable(capabilities: SourceCapabilities): boolean {
  return capabilities.balanceVisibility !== 'none';
}

/**
 * The strongest guarantee this source can offer a prepared leg.
 *
 * Ordering matters and is not arbitrary. Funds ring-fenced in an account we
 * control outrank an authorisation held by someone else: a reserve is a book
 * entry that cannot be declined, whereas a card preauthorisation can still
 * fail at capture — the issuer can decline, the authorisation can lapse, the
 * cardholder can dispute. Both outrank a signature we obtained for a transfer
 * that has not been broadcast, which outranks nothing at all.
 *
 * `FLOAT_BACKED` is the floor. It is not a failure state — it is the accurate
 * name for "verified but unlockable", which is what every Nigerian bank leg is
 * and will remain until a rail there offers an authorisation step (ADR-000).
 */
export function guaranteeFor(capabilities: SourceCapabilities): GuaranteeKind {
  if (capabilities.reserveSupported) return 'RESERVED';
  if (capabilities.holdSupported && capabilities.captureSupported) return 'PREAUTHORIZED';
  if (capabilities.requiresUserSignature || capabilities.rail === 'ONCHAIN') return 'SIGNED';
  return 'FLOAT_BACKED';
}

/** Guarantee strength, 0..1 — the `settlementCertainty` ranking term. */
const GUARANTEE_STRENGTH: Record<GuaranteeKind, number> = {
  RESERVED: 1,
  PREAUTHORIZED: 0.9,
  SIGNED: 0.7,
  FLOAT_BACKED: 0.45,
};

export function guaranteeStrength(guarantee: GuaranteeKind): number {
  return GUARANTEE_STRENGTH[guarantee];
}

/** Weakest guarantee across a set — a plan is only as atomic as its worst leg. */
export function weakestGuarantee(guarantees: GuaranteeKind[]): GuaranteeKind {
  if (guarantees.length === 0) return 'FLOAT_BACKED';
  return guarantees.reduce((worst, next) =>
    guaranteeStrength(next) < guaranteeStrength(worst) ? next : worst
  );
}

/**
 * Does this leg need Lenz's float to be safe?
 *
 * True exactly when nothing can be reserved — the money is still sitting in
 * an account the user can empty between confirmation and collection.
 */
export function requiresFloat(capabilities: SourceCapabilities): boolean {
  return guaranteeFor(capabilities) === 'FLOAT_BACKED';
}

/**
 * How much to trust the balance we are planning against, 0..1.
 *
 * Two independent factors: what the rail will tell us, and how long ago it
 * told us. A card scores 0 because it discloses nothing — which is correct
 * and is not a disqualification, since a card compensates on
 * `settlementCertainty`.
 */
const VISIBILITY_CONFIDENCE: Record<BalanceVisibility, number> = {
  exact: 1,
  // Enough to commit a leg, but it answers one question rather than describing
  // the account — so a shortfall on a *later* leg cannot be anticipated.
  sufficiency_only: 0.85,
  none: 0,
};

export function balanceCertainty(
  source: PaymentSource,
  capabilities: SourceCapabilities,
  now: number,
  freshnessMs: number
): number {
  const visibility = VISIBILITY_CONFIDENCE[capabilities.balanceVisibility];
  if (visibility === 0) return 0;

  const age = Math.max(0, now - source.lastSynced.getTime());
  if (age <= freshnessMs) return visibility;

  // Decay to a floor rather than to zero: a stale balance is a weaker signal,
  // not a worthless one. Mirrors treasury.freshnessFactor deliberately.
  const staleness = Math.min(1, (age - freshnessMs) / (freshnessMs * 10));
  return visibility * (1 - 0.4 * staleness);
}

/**
 * Settlement latency as a 0..1 score, faster being better. Capped so that an
 * unusually slow rail is penalised but never scored out of contention — a slow
 * source that covers the payment still beats a failed payment.
 */
const SLOWEST_MEANINGFUL_MS = 60_000;

export function latencyScore(capabilities: SourceCapabilities): number {
  const ratio = Math.min(1, capabilities.settlementLatencyMs / SLOWEST_MEANINGFUL_MS);
  return 1 - ratio;
}

/**
 * What this source can actually spend, in its native currency.
 *
 * Prefers the provider's spendable figure over the headline balance. These
 * differ routinely, and planning against the headline number produces legs
 * that pass planning and fail collection.
 */
export function spendableBalance(source: PaymentSource): number {
  const spendable = source.spendableRawBalance;
  if (spendable === undefined || !Number.isFinite(spendable)) return source.rawBalance;
  return Math.max(0, Math.min(spendable, source.rawBalance));
}

/**
 * Combined probability this source's debit actually lands, 0..1.
 *
 * Two independent priors multiplied: the rail's own failure rate, and this
 * particular account's observed history.
 */
export function successProbability(
  source: PaymentSource,
  capabilities: SourceCapabilities
): number {
  const railSuccess = 1 - Math.min(1, Math.max(0, capabilities.failureRate));
  const history = source.reliability ?? DEFAULT_RELIABILITY;
  return railSuccess * history;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Resolves a source to its capabilities, merging three layers in order of
 * increasing specificity: the rail profile, a registered per-type override,
 * then anything the provider reported on the source itself.
 *
 * The last layer matters most in practice — capabilities vary *within* a rail
 * (one aggregator exposes authorise/capture, another only a single-shot
 * debit), so they cannot be a per-type assumption.
 */
export class CapabilityRegistry {
  private readonly byType = new Map<SourceType, Partial<SourceCapabilities>>();
  private readonly bySourceId = new Map<string, Partial<SourceCapabilities>>();

  registerType(type: SourceType, overrides: Partial<SourceCapabilities>): this {
    this.byType.set(type, { ...this.byType.get(type), ...overrides });
    return this;
  }

  registerSource(sourceId: string, overrides: Partial<SourceCapabilities>): this {
    this.bySourceId.set(sourceId, { ...this.bySourceId.get(sourceId), ...overrides });
    return this;
  }

  resolve(source: PaymentSource): SourceCapabilities {
    return {
      ...railProfile(source.type),
      ...this.byType.get(source.type),
      ...this.bySourceId.get(source.id),
      ...source.capabilities,
    };
  }

  /** Capability view of every source, for diagnostics and the sources screen. */
  describe(sources: PaymentSource[]): { source: PaymentSource; capabilities: SourceCapabilities; guarantee: GuaranteeKind }[] {
    return sources.map((source) => {
      const capabilities = this.resolve(source);
      return { source, capabilities, guarantee: guaranteeFor(capabilities) };
    });
  }
}

/** Process-wide default registry. Swap per-source entries at provider wiring. */
export const capabilityRegistry = new CapabilityRegistry();
