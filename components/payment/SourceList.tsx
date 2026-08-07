import React from 'react';
import { View } from 'react-native';
import { SourceCard } from './SourceCard';
import type { PaymentResult, PaymentSource } from '@/types/payment';

interface SourceListProps {
  sources: PaymentSource[];
  amountNGN: number;
  result: PaymentResult;
  mode: 'auto' | 'manual';
  manualSelectedId?: string;
  onSelectManual?: (source: PaymentSource) => void;
}

/**
 * Renders the source list for both scan/source.tsx modes:
 * - auto: status comes straight from usePaymentLogic's result
 * - manual: any source with balance >= amount is tappable; others read LOW
 */
export function SourceList({ sources, amountNGN, result, mode, manualSelectedId, onSelectManual }: SourceListProps) {
  return (
    <View>
      {sources.map((source) => {
        if (mode === 'auto') {
          const isAutoPick = result.autoSelected?.id === source.id;
          const splitAllocation = result.splitAllocations?.find((a) => a.source.id === source.id);
          const status = isAutoPick
            ? 'auto'
            : splitAllocation
              ? 'split'
              : source.balance <= 0
                ? 'insufficient'
                : source.balance < amountNGN && !splitAllocation
                  ? 'insufficient'
                  : 'active';

          return (
            <SourceCard key={source.id} source={source} status={status} splitAmount={splitAllocation?.amount} />
          );
        }

        const isSufficient = source.balance >= amountNGN;
        const isSelected = manualSelectedId === source.id;
        const status = isSelected ? 'selected' : isSufficient ? 'active' : 'insufficient';

        return (
          <SourceCard
            key={source.id}
            source={source}
            status={status}
            onPress={isSufficient ? () => onSelectManual?.(source) : undefined}
          />
        );
      })}
    </View>
  );
}
