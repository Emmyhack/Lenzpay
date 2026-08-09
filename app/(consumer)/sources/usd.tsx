import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { useSourcesStore } from '@/store/sources';
import { showToast } from '@/components/ui/Toast';

interface USDProvider {
  key: string;
  name: string;
  icon: string;
  subtitle: string;
}

const USD_PROVIDERS: USDProvider[] = [
  { key: 'grey', name: 'Grey Finance', icon: '🌍', subtitle: 'Virtual USD account, instant setup' },
  { key: 'geegpay', name: 'Geegpay', icon: '💳', subtitle: 'USD wallet for freelancers' },
  { key: 'chipper', name: 'Chipper Cash', icon: '🐦', subtitle: 'Cross-border USD balance' },
];

export default function AddUSDScreen() {
  const router = useRouter();
  const addSource = useSourcesStore((s) => s.addSource);
  const [selected, setSelected] = useState<string | null>(null);
  const [autoConvert, setAutoConvert] = useState(true);

  const handleLink = () => {
    const provider = USD_PROVIDERS.find((p) => p.key === selected);
    if (!provider) return;

    addSource({
      id: `src_${provider.key}_${Date.now()}`,
      type: 'usd',
      label: provider.name,
      accountMask: 'Virtual',
      currency: 'NGN',
      balance: 0,
      rawBalance: 0,
      rawCurrency: 'USD',
      isDefault: false,
      flag: '🇺🇸',
      lastSynced: new Date(),
    });
    showToast('success', `${provider.name} connected`);
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Add USD Account" />

      <View style={styles.list}>
        {USD_PROVIDERS.map((provider) => (
          <TouchableOpacity
            key={provider.key}
            onPress={() => setSelected(provider.key)}
            style={[styles.card, selected === provider.key && styles.cardActive]}
            activeOpacity={0.85}
          >
            <Text style={styles.cardIcon}>{provider.icon}</Text>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{provider.name}</Text>
              <Text style={styles.cardSubtitle}>{provider.subtitle}</Text>
            </View>
            {selected === provider.key ? <Text style={styles.check}>✓</Text> : null}
          </TouchableOpacity>
        ))}

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Always convert USD → NGN</Text>
            <Text style={styles.toggleSubtitle}>Balances are shown in NGN and auto-converted at payment time.</Text>
          </View>
          <Toggle value={autoConvert} onValueChange={setAutoConvert} />
        </View>

        <Button label="Link Account →" onPress={handleLink} disabled={!selected} style={styles.submit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    paddingHorizontal: Spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardActive: {
    borderColor: Colors.primary,
  },
  cardIcon: { fontSize: 24 },
  cardInfo: { flex: 1 },
  cardName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  cardSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  check: {
    color: Colors.primary,
    fontSize: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  toggleInfo: { flex: 1 },
  toggleTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
  },
  toggleSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  submit: {
    marginTop: Spacing.xxl,
  },
});
