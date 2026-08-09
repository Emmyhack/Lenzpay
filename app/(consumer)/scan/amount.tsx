import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { AmountInput } from '@/components/payment/AmountInput';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { usePaymentStore } from '@/store/payment';
import { useFXRates } from '@/hooks/useFXRates';
import { CASHBACK_RATES } from '@/mock/data';
import type { Merchant } from '@/types/payment';

const QUICK_AMOUNTS = [1_000, 2_000, 5_000, 10_000];

const MANUAL_MERCHANT: Merchant = {
  id: 'manual',
  name: 'Manual Payment',
  category: 'other',
  isVerified: false,
  location: '',
  acceptedCurrencies: ['NGN'],
  icon: '✏️',
};

export default function AmountScreen() {
  const router = useRouter();
  const storeMerchant = usePaymentStore((s) => s.merchant);
  const setAmount = usePaymentStore((s) => s.setAmount);
  const { data: rates } = useFXRates();
  const [raw, setRaw] = useState('');

  const merchant = storeMerchant ?? MANUAL_MERCHANT;
  const amountNGN = raw ? Number(raw) : 0;

  const equivalents = useMemo(() => {
    if (!rates || amountNGN <= 0) return undefined;
    const usd = amountNGN / rates.USD_NGN;
    const btc = amountNGN / rates.BTC_NGN;
    return `≈ $${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} · ≈ ${btc.toFixed(6)} BTC`;
  }, [rates, amountNGN]);

  const rewardsEstimate = useMemo(() => {
    if (amountNGN <= 0) return null;
    const rate = CASHBACK_RATES[merchant.category] ?? CASHBACK_RATES.other;
    const cashback = Math.round(amountNGN * rate);
    const points = Math.round(amountNGN * rate * 5); // matches mock ~5pts per ₦1 cashback
    return { cashback, points };
  }, [amountNGN, merchant.category]);

  const handleContinue = () => {
    setAmount(amountNGN);
    router.push('/(consumer)/scan/source');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Enter Amount" />

      <View style={styles.merchantRow}>
        <Text style={styles.merchantIcon}>{merchant.icon}</Text>
        <Text style={styles.merchantName}>{merchant.name}</Text>
        {merchant.isVerified ? <Badge kind="VERIFIED" /> : null}
      </View>

      <View style={styles.inputSection}>
        <AmountInput value={raw} onChangeValue={setRaw} equivalents={equivalents} />
      </View>

      {rewardsEstimate ? (
        <View style={styles.rewardsHint}>
          <Text style={styles.rewardsText}>
            ⭐ Earn ~{rewardsEstimate.points} pts · ₦{rewardsEstimate.cashback} cashback
          </Text>
        </View>
      ) : null}

      <View style={styles.chipRow}>
        {QUICK_AMOUNTS.map((amt) => (
          <Chip key={amt} label={`₦${amt.toLocaleString()}`} onPress={() => setRaw(String(amt))} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button label="Continue →" onPress={handleContinue} disabled={amountNGN <= 0} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  merchantIcon: { fontSize: 18 },
  merchantName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  inputSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  rewardsHint: {
    alignSelf: 'center',
    backgroundColor: Colors.primary + '18',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.lg,
  },
  rewardsText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
});
