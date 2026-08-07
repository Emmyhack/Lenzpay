import { useMemo } from 'react';
import type { PaymentSource, PaymentResult, SplitAllocation, SourceType } from '@/types/payment';

const SOURCE_PRIORITY: Record<SourceType, number> = {
  bank: 1, // NGN banks first
  wallet: 2, // NGN wallets second
  usd: 3, // USD (converted) third
  crypto: 4, // Crypto last (conversion overhead)
};

/**
 * Core Lenz Pay intelligence:
 * 1. Find single source that covers payment (prefer NGN)
 * 2. If none: check if total covers it → Smart Split
 * 3. If split: greedy allocation from largest NGN → USD → crypto
 * 4. If total insufficient: show deficit
 */
export function usePaymentLogic(amountNGN: number, sources: PaymentSource[]): PaymentResult {
  return useMemo(() => {
    if (amountNGN <= 0 || sources.length === 0) {
      return {
        mode: 'auto',
        totalCoverable: 0,
        deficit: amountNGN,
        isCoverable: false,
      };
    }

    const activeSources = sources.filter((s) => s.balance > 0);
    const totalCoverable = activeSources.reduce((sum, s) => sum + s.balance, 0);
    const isCoverable = totalCoverable >= amountNGN;

    // Step 1: Find single sufficient source
    const sufficientSources = activeSources
      .filter((s) => s.balance >= amountNGN)
      .sort((a, b) => SOURCE_PRIORITY[a.type] - SOURCE_PRIORITY[b.type]);

    if (sufficientSources.length > 0) {
      return {
        mode: 'auto',
        autoSelected: sufficientSources[0],
        totalCoverable,
        deficit: 0,
        isCoverable: true,
      };
    }

    // Step 2: No single source — attempt Smart Split
    if (!isCoverable) {
      return {
        mode: 'split',
        totalCoverable,
        deficit: amountNGN - totalCoverable,
        isCoverable: false,
      };
    }

    // Step 3: Build greedy split allocation
    const sorted = [...activeSources].sort((a, b) => {
      const priorityDiff = SOURCE_PRIORITY[a.type] - SOURCE_PRIORITY[b.type];
      if (priorityDiff !== 0) return priorityDiff;
      return b.balance - a.balance; // largest balance first within same type
    });

    const splitAllocations: SplitAllocation[] = [];
    let remaining = amountNGN;

    for (const source of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(source.balance, remaining);
      splitAllocations.push({ source, amount: take });
      remaining -= take;
    }

    return {
      mode: 'split',
      splitAllocations,
      totalCoverable,
      deficit: 0,
      isCoverable: true,
    };
  }, [amountNGN, sources]);
}
