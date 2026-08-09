import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useSecurityStore } from '@/store/security';
import { showToast } from '@/components/ui/Toast';

const DAILY_PRESETS = [100_000, 500_000, 1_000_000, 2_000_000];
const PER_TXN_PRESETS = [50_000, 200_000, 500_000, 1_000_000];

export default function LimitsScreen() {
  const router = useRouter();
  const dailyLimitNGN = useSecurityStore((s) => s.dailyLimitNGN);
  const perTxnLimitNGN = useSecurityStore((s) => s.perTxnLimitNGN);
  const setDailyLimit = useSecurityStore((s) => s.setDailyLimit);
  const setPerTxnLimit = useSecurityStore((s) => s.setPerTxnLimit);

  const [daily, setDaily] = useState(String(dailyLimitNGN));
  const [perTxn, setPerTxn] = useState(String(perTxnLimitNGN));

  const handleSave = () => {
    setDailyLimit(Number(daily) || 0);
    setPerTxnLimit(Number(perTxn) || 0);
    showToast('success', 'Limits updated');
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Transaction Limits" />

      <View style={styles.body}>
        <Text style={styles.label}>Daily limit</Text>
        <View style={styles.inputRow}>
          <Text style={styles.prefix}>₦</Text>
          <TextInput
            value={daily ? Number(daily).toLocaleString() : ''}
            onChangeText={(t) => setDaily(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            style={styles.input}
            accessibilityLabel="Daily limit"
          />
        </View>
        <View style={styles.presetRow}>
          {DAILY_PRESETS.map((amt) => (
            <Chip key={amt} label={`₦${(amt / 1000).toLocaleString()}k`} selected={daily === String(amt)} onPress={() => setDaily(String(amt))} />
          ))}
        </View>

        <Text style={[styles.label, styles.spaced]}>Per-transaction limit</Text>
        <View style={styles.inputRow}>
          <Text style={styles.prefix}>₦</Text>
          <TextInput
            value={perTxn ? Number(perTxn).toLocaleString() : ''}
            onChangeText={(t) => setPerTxn(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            style={styles.input}
            accessibilityLabel="Per-transaction limit"
          />
        </View>
        <View style={styles.presetRow}>
          {PER_TXN_PRESETS.map((amt) => (
            <Chip key={amt} label={`₦${(amt / 1000).toLocaleString()}k`} selected={perTxn === String(amt)} onPress={() => setPerTxn(String(amt))} />
          ))}
        </View>

        <Button label="Save Limits" onPress={handleSave} style={styles.submit} />
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
    paddingHorizontal: Spacing.xl,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  spaced: {
    marginTop: Spacing.xl,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
  },
  prefix: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceVariant,
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
  },
  submit: {
    marginTop: Spacing.xxl,
  },
});
