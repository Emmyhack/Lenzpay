import { Config } from '@/constants/config';
import { api } from './api';
import { configureEngine } from './orchestration';
import { createApiBalanceProvider, createMockBalanceProvider } from './balances';
import { useSourcesStore } from '@/store/sources';

/**
 * Wire the orchestration engine's runtime dependencies.
 *
 * The engine deliberately knows nothing about axios, the sources store, or
 * which aggregator is behind a source — everything provider-shaped is injected.
 * This module is the one place that binding happens, and it is the seam a real
 * backend replaces.
 *
 * Called once from the root layout, before any payment can be planned.
 */
export function configureEngineForRuntime(): void {
  configureEngine({
    balances: Config.useMockData
      ? createMockBalanceProvider({
          // Read through the store rather than a snapshot: balances change as
          // payments settle, and `prepare()` verifying against a stale copy
          // would defeat the point of verifying at all.
          lookup: (sourceId) =>
            useSourcesStore.getState().sources.find((source) => source.id === sourceId),
          // Stable in the demo. Raise it to make the "your balance moved" path
          // reachable without having to move real money.
          driftRatio: 0,
        })
      : createApiBalanceProvider({
          client: api,
          // Flip on once the backend exposes the sufficiency endpoint — it
          // discloses less than a balance read and answers the same question.
          supportsSufficiency: false,
        }),
  });
}
