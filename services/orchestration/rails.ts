import type { CurrencyCode, PaymentSource, SourceType } from '@/types/payment';
import type { FundingLeg, Payee } from '@/types/orchestration';
import { Orchestration } from '@/constants/config';
import { nextId } from './ids';

/**
 * Rail adapters (§6.1) — the boundary between the orchestration engine and the
 * outside world.
 *
 * Every funding source, whatever it is underneath (an Open Banking aggregator,
 * a domiciliary account, a crypto wallet), is reachable through the same
 * three-verb contract:
 *
 *   hold    — reserve funds without moving them
 *   capture — convert a hold into an actual debit
 *   release — give a hold back, un-charged
 *
 * That uniformity is what makes the atomic waterfall possible: the executor
 * places every hold before capturing any of them, so a plan can be abandoned
 * cleanly at any point before the first capture. Rails that can't genuinely
 * hold must emulate it (see `supportsNativeHold`) — and the executor treats
 * emulated holds as riskier by ordering them last.
 */

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface HoldRequest {
  legId: string;
  source: PaymentSource;
  amountInSourceCurrency: number;
  currency: CurrencyCode;
  /** Scoped per leg so a retry of one leg never re-executes another. */
  idempotencyKey: string;
  ttlMs: number;
}

export type HoldResult =
  | { ok: true; holdRef: string; expiresAt: number }
  | { ok: false; reason: string; retryable: boolean };

export interface CaptureRequest {
  legId: string;
  source: PaymentSource;
  holdRef: string;
  amountInSourceCurrency: number;
  idempotencyKey: string;
}

export type CaptureResult =
  | { ok: true; captureRef: string }
  | { ok: false; reason: string; retryable: boolean };

export interface ReleaseRequest {
  legId: string;
  source: PaymentSource;
  holdRef: string;
  idempotencyKey: string;
}

export type ReleaseResult = { ok: true } | { ok: false; reason: string };

export interface RefundRequest {
  legId: string;
  source: PaymentSource;
  captureRef: string;
  amountInSourceCurrency: number;
  idempotencyKey: string;
  reason: string;
}

export type RefundResult =
  | { ok: true; refundRef: string }
  | { ok: false; reason: string };

export interface RailAdapter {
  readonly id: string;
  /**
   * False for rails that can only debit outright (some wallet APIs). The
   * executor still calls `hold`, but knows the guarantee is weaker and orders
   * those legs last, so as much of the plan as possible can be abandoned
   * before any real money moves.
   */
  readonly supportsNativeHold: boolean;
  hold(request: HoldRequest): Promise<HoldResult>;
  capture(request: CaptureRequest): Promise<CaptureResult>;
  release(request: ReleaseRequest): Promise<ReleaseResult>;
  /**
   * Compensating action for an already-captured leg. Only reachable when a
   * later leg or the payout fails after this one has settled — hold-then-
   * capture exists precisely to make this path rare. A rail that cannot
   * programmatically refund omits this, and the engine reports the
   * transaction as `partially_reversed` for manual treasury follow-up.
   */
  refund?(request: RefundRequest): Promise<RefundResult>;
}

// ---------------------------------------------------------------------------
// Payout rail (§6.1, bottom of the stack)
// ---------------------------------------------------------------------------

export interface SettlementRequest {
  payee: Payee;
  amount: number;
  currency: CurrencyCode;
  idempotencyKey: string;
  legs: FundingLeg[];
}

export type SettlementResult =
  | { ok: true; settlementRef: string; settledAt: number }
  | { ok: false; reason: string; retryable: boolean };

export interface SettlementRail {
  settle(request: SettlementRequest): Promise<SettlementResult>;
}

// ---------------------------------------------------------------------------
// Mock rails
// ---------------------------------------------------------------------------

export interface MockRailConfig {
  id: string;
  supportsNativeHold?: boolean;
  /** Simulated round-trip latency. Set 0 in tests. */
  latencyMs?: number;
  /** Source ids whose hold/capture/release should fail, for testing §5.7. */
  failHoldFor?: Set<string>;
  failCaptureFor?: Set<string>;
  failReleaseFor?: Set<string>;
  failRefundFor?: Set<string>;
  /** Omit refund support entirely, to exercise the manual-follow-up path. */
  supportsRefund?: boolean;
  /** Random failure probability, applied when the explicit sets don't match. */
  holdFailureRate?: number;
  captureFailureRate?: number;
  random?: () => number;
}

async function pause(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockRail(config: MockRailConfig): RailAdapter {
  const {
    id,
    supportsNativeHold = true,
    latencyMs = 0,
    failHoldFor,
    failCaptureFor,
    failReleaseFor,
    failRefundFor,
    supportsRefund = true,
    holdFailureRate = 0,
    captureFailureRate = 0,
    random = Math.random,
  } = config;

  /** Holds this rail currently owes back. Guards double-capture/double-release. */
  const openHolds = new Map<string, { legId: string; amount: number }>();

  const refund: RailAdapter['refund'] = async (request: RefundRequest) => {
    await pause(latencyMs);
    if (failRefundFor?.has(request.source.id)) {
      return { ok: false, reason: `Refund to ${request.source.label} failed` };
    }
    return { ok: true, refundRef: nextId(`ref_${id}`) };
  };

  return {
    id,
    supportsNativeHold,
    ...(supportsRefund ? { refund } : {}),

    async hold(request) {
      await pause(latencyMs);

      if (request.amountInSourceCurrency <= 0) {
        return { ok: false, reason: 'Hold amount must be positive', retryable: false };
      }
      if (request.amountInSourceCurrency > request.source.rawBalance) {
        return {
          ok: false,
          reason: `${request.source.label} has insufficient balance for this hold`,
          retryable: false,
        };
      }
      if (failHoldFor?.has(request.source.id)) {
        return {
          ok: false,
          reason: `${request.source.label} is unavailable right now`,
          retryable: true,
        };
      }
      if (holdFailureRate > 0 && random() < holdFailureRate) {
        return {
          ok: false,
          reason: `${request.source.label} did not respond in time`,
          retryable: true,
        };
      }

      const holdRef = nextId(`hold_${id}`);
      openHolds.set(holdRef, {
        legId: request.legId,
        amount: request.amountInSourceCurrency,
      });
      return { ok: true, holdRef, expiresAt: Date.now() + request.ttlMs };
    },

    async capture(request) {
      await pause(latencyMs);

      const held = openHolds.get(request.holdRef);
      if (!held) {
        return {
          ok: false,
          reason: 'Hold not found, already captured, or expired',
          retryable: false,
        };
      }
      if (failCaptureFor?.has(request.source.id)) {
        return {
          ok: false,
          reason: `${request.source.label} declined the debit`,
          retryable: false,
        };
      }
      if (captureFailureRate > 0 && random() < captureFailureRate) {
        return {
          ok: false,
          reason: `${request.source.label} declined the debit`,
          retryable: false,
        };
      }

      openHolds.delete(request.holdRef);
      return { ok: true, captureRef: nextId(`cap_${id}`) };
    },

    async release(request) {
      await pause(latencyMs);

      if (failReleaseFor?.has(request.source.id)) {
        return { ok: false, reason: `Could not release hold on ${request.source.label}` };
      }
      // Releasing an unknown hold is a no-op success: the point of release is
      // that the money is not held, and a hold that never landed satisfies
      // that. Making this idempotent keeps rollback safe to retry.
      openHolds.delete(request.holdRef);
      return { ok: true };
    },
  };
}

export function createMockSettlementRail(
  options: { latencyMs?: number; fail?: boolean; reason?: string } = {}
): SettlementRail {
  const { latencyMs = 0, fail = false, reason = 'Payee settlement rail rejected the payout' } =
    options;

  return {
    async settle() {
      await pause(latencyMs);
      if (fail) return { ok: false, reason, retryable: true };
      return { ok: true, settlementRef: nextId('stl'), settledAt: Date.now() };
    },
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Maps a funding source to the rail that can move its money. Real deployments
 * register one adapter per provider (Mono, a domiciliary partner, a custody
 * provider); the engine only ever sees the three-verb contract.
 */
export class RailRegistry {
  private readonly byType = new Map<SourceType, RailAdapter>();
  private readonly bySourceId = new Map<string, RailAdapter>();

  registerType(type: SourceType, adapter: RailAdapter): this {
    this.byType.set(type, adapter);
    return this;
  }

  registerSource(sourceId: string, adapter: RailAdapter): this {
    this.bySourceId.set(sourceId, adapter);
    return this;
  }

  resolve(source: PaymentSource): RailAdapter {
    const adapter = this.bySourceId.get(source.id) ?? this.byType.get(source.type);
    if (!adapter) {
      throw new Error(`No rail registered for source ${source.id} (${source.type})`);
    }
    return adapter;
  }
}

/** Dev registry: one mock rail per source type, wallets without native holds. */
export function createDevRailRegistry(
  overrides: Partial<Record<SourceType, MockRailConfig>> = {}
): RailRegistry {
  const defaults: Record<SourceType, MockRailConfig> = {
    bank: { id: 'bank_aggregator', latencyMs: 0 },
    // Wallet APIs typically debit outright rather than authorise-then-capture.
    wallet: { id: 'wallet_provider', latencyMs: 0, supportsNativeHold: false },
    usd: { id: 'fx_partner', latencyMs: 0 },
    crypto: { id: 'crypto_custody', latencyMs: 0 },
  };

  const registry = new RailRegistry();
  (Object.keys(defaults) as SourceType[]).forEach((type) => {
    registry.registerType(type, createMockRail({ ...defaults[type], ...overrides[type] }));
  });
  return registry;
}

export const DEFAULT_HOLD_TTL_MS = Orchestration.holdTtlMs;
