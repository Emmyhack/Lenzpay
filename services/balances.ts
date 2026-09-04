import type { PaymentSource } from '@/types/payment';
import type {
  BalanceProvider,
  BalanceReading,
  SufficiencyReading,
} from '@/services/orchestration';
import { spendableBalance } from '@/services/orchestration';

/**
 * Live balance access for `prepare()` (ADR-013).
 *
 * Without one of these the engine verifies a float-backed leg against the
 * balance the *plan* was built from — which is not verification at all. It
 * means fronting money on a cached number, and the whole point of the prepare
 * stage is that the figures the user approves are current.
 *
 * Two implementations:
 *
 *  - `createMockBalanceProvider` — reads from whatever the app holds in memory,
 *    with optional drift so the `balance_moved` path is reachable in
 *    development rather than only in production.
 *  - `createApiBalanceProvider` — the real one. The HTTP client is a
 *    *parameter*, not an import, so this module stays free of React Native and
 *    the engine keeps its provider independence.
 *
 * Both prefer sufficiency over disclosure where the rail allows it: asking
 * "can this account provide ₦37,500?" reveals strictly less than reading the
 * balance and answers the only question planning needs.
 */

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

export interface MockBalanceOptions {
  /** Where current balances live — usually the sources store's getter. */
  lookup: (sourceId: string) => PaymentSource | undefined;
  /**
   * Simulated movement between planning and preparing, as a fraction of the
   * balance. `0.0` is a stable demo; `0.1` means balances wander by up to 10%
   * so the "your balance moved" path is actually reachable in development.
   */
  driftRatio?: number;
  random?: () => number;
  now?: () => number;
}

export function createMockBalanceProvider(options: MockBalanceOptions): BalanceProvider {
  const { lookup, driftRatio = 0, random = Math.random, now = Date.now } = options;

  const observe = (sourceId: string): { source: PaymentSource; balance: number } | null => {
    const source = lookup(sourceId);
    if (!source) return null;

    const base = spendableBalance(source);
    if (driftRatio <= 0) return { source, balance: base };

    // Drift both ways. A balance that only ever falls would make the failure
    // path look like the normal one.
    const drift = (random() * 2 - 1) * driftRatio;
    return { source, balance: Math.max(0, base * (1 + drift)) };
  };

  return {
    async read(source): Promise<BalanceReading> {
      const observed = observe(source.id);
      if (!observed) {
        return { ok: false, reason: `${source.label} is no longer linked.` };
      }
      return { ok: true, balance: observed.balance, observedAt: now() };
    },

    async sufficient(source, amountInSourceCurrency): Promise<SufficiencyReading> {
      const observed = observe(source.id);
      if (!observed) {
        return { ok: false, reason: `${source.label} is no longer linked.` };
      }
      return {
        ok: true,
        sufficient: observed.balance >= amountInSourceCurrency,
        observedAt: now(),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// API-backed
// ---------------------------------------------------------------------------

/** The shape `prepare()` needs from an HTTP client. Kept minimal on purpose. */
export interface BalanceHttpClient {
  get<T>(url: string): Promise<{ data: T }>;
}

export interface ApiBalanceResponse {
  /** Native-currency balance actually available to spend. */
  spendable: number;
  /** When the provider observed it. Epoch ms. Falls back to receipt time. */
  observedAt?: number;
}

export interface ApiSufficiencyResponse {
  sufficient: boolean;
  observedAt?: number;
}

export interface ApiBalanceOptions {
  client: BalanceHttpClient;
  /**
   * Whether the backend exposes the privacy-preserving sufficiency endpoint.
   * When false the provider omits `sufficient` entirely, so `prepare()` falls
   * back to reading balances rather than calling an endpoint that isn't there.
   */
  supportsSufficiency?: boolean;
  now?: () => number;
}

export function createApiBalanceProvider(options: ApiBalanceOptions): BalanceProvider {
  const { client, supportsSufficiency = false, now = Date.now } = options;

  const provider: BalanceProvider = {
    async read(source): Promise<BalanceReading> {
      try {
        const { data } = await client.get<ApiBalanceResponse>(
          `/sources/${encodeURIComponent(source.id)}/balance`
        );
        if (typeof data?.spendable !== 'number' || !Number.isFinite(data.spendable)) {
          return { ok: false, reason: `Could not read the balance on ${source.label}.` };
        }
        return { ok: true, balance: data.spendable, observedAt: data.observedAt ?? now() };
      } catch {
        // Deliberately not surfacing the transport error: a prepare failure is
        // shown to the user, and "Request failed with status code 502" is not
        // something they can act on.
        return { ok: false, reason: `Could not reach ${source.label} just now.` };
      }
    },
  };

  if (supportsSufficiency) {
    provider.sufficient = async (source, amountInSourceCurrency) => {
      try {
        const { data } = await client.get<ApiSufficiencyResponse>(
          `/sources/${encodeURIComponent(source.id)}/sufficient?amount=${amountInSourceCurrency}`
        );
        if (typeof data?.sufficient !== 'boolean') {
          return { ok: false, reason: `Could not check funds on ${source.label}.` };
        }
        return { ok: true, sufficient: data.sufficient, observedAt: data.observedAt ?? now() };
      } catch {
        return { ok: false, reason: `Could not reach ${source.label} just now.` };
      }
    };
  }

  return provider;
}
