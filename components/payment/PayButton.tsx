import React from 'react';
import { Button } from '@/components/ui/Button';

interface PayButtonProps {
  amountNGN: number;
  isCoverable: boolean;
  loading?: boolean;
  onPress: () => void;
}

/**
 * State-aware CTA for the scan/pay flow: label and disabled state track the
 * live payment amount and whether usePaymentLogic found a way to cover it.
 */
export function PayButton({ amountNGN, isCoverable, loading = false, onPress }: PayButtonProps) {
  const label = amountNGN > 0 ? `Pay ₦${amountNGN.toLocaleString()}` : 'Enter an amount';

  return (
    <Button
      label={label}
      trailingArrow={amountNGN > 0}
      onPress={onPress}
      loading={loading}
      disabled={amountNGN <= 0 || !isCoverable}
      variant="primary"
    />
  );
}
