import { useMemo } from 'react';
import { useSourcesStore } from '@/store/sources';

/**
 * Aggregate NGN-equivalent balance across all connected sources, plus a
 * per-source breakdown — used by the home dashboard's BalanceHero and by
 * source detail screens.
 */
export function useBalance() {
  const sources = useSourcesStore((s) => s.sources);

  return useMemo(() => {
    const totalNGN = sources.reduce((sum, s) => sum + s.balance, 0);
    const byId = Object.fromEntries(sources.map((s) => [s.id, s.balance]));
    return { totalNGN, byId, sourceCount: sources.length };
  }, [sources]);
}
