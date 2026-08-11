import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SplitPreview } from '@/components/payment/SplitPreview';
import { Button } from '@/components/ui/Button';
import { usePaymentLogic } from '@/hooks/usePaymentLogic';
import { useSourcesStore } from '@/store/sources';
import { usePaymentStore } from '@/store/payment';
import { useRewardsStore } from '@/store/rewards';
import { REWARDS_TIERS } from '@/mock/rewards';

export default function SplitScreen() {
  const router = useRouter();
  const sources = useSourcesStore((s) => s.sources);
  const amountNGN = usePaymentStore((s) => s.amountNGN);
  const setSplitAllocations = usePaymentStore((s) => s.setSplitAllocations);

  const setPlan = usePaymentStore((s) => s.setPlan);
  const storedPlan = usePaymentStore((s) => s.plan);

  const tier = useRewardsStore((s) => s.tier);
  const spreadDiscount =
    REWARDS_TIERS.find((t) => t.name === tier)?.fxSpreadDiscount ?? 0;

  const result = usePaymentLogic(amountNGN, sources, { spreadDiscount });
  // Prefer the plan already committed on the source screen — re-planning here
  // could quote a different rate than the one the user was shown.
  const plan = storedPlan ?? result.plan;
  const allocations =
    plan?.legs.map((leg) => ({
      source: leg.source,
      amount: leg.amountInSettlementCurrency,
    })) ?? [];

  const handleConfirm = () => {
    if (!plan) return;
    setPlan(plan);
    setSplitAllocations(allocations);
    router.push('/(consumer)/scan/confirm');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Smart Split" subtitle={`₦${amountNGN.toLocaleString()} across ${allocations.length} sources`} />

      <View style={styles.body}>
        <SplitPreview amountNGN={amountNGN} allocations={allocations} />
      </View>

      <View style={styles.footer}>
        <Button label="Confirm Split" trailingArrow onPress={handleConfirm} disabled={allocations.length === 0} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
});
