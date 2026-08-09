import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { BankLogo } from '@/components/ui/BankLogo';
import { useMerchantStore } from '@/store/merchant';
import { NIGERIAN_BANKS, type NigerianBank } from '@/mock/banks';

export default function SettlementSetupScreen() {
  const router = useRouter();
  const updateProfile = useMerchantStore((s) => s.updateProfile);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<NigerianBank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredBanks = NIGERIAN_BANKS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    setResolvedName(null);
    if (accountNumber.length !== 10 || !selectedBank) return;
    setResolving(true);
    const timer = setTimeout(() => {
      setResolvedName("Emeka's Kitchen Ltd");
      setResolving(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [accountNumber, selectedBank]);

  const canSubmit = !!selectedBank && accountNumber.length === 10 && !!resolvedName;

  const handleContinue = async () => {
    if (!selectedBank) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    updateProfile({ settlementAccountLabel: `${selectedBank.name} *${accountNumber.slice(-4)}` });
    setSaving(false);
    router.push('/(merchant)/onboarding/qr-setup');
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Where should we settle?" subtitle="Step 3 of 4" />

      <View style={styles.form}>
        <Text style={styles.label}>Settlement bank</Text>
        <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.bankSelector}>
          <View style={styles.bankSelectorLeft}>
            {selectedBank ? <BankLogo code={selectedBank.code} name={selectedBank.name} size={28} /> : null}
            <Text style={selectedBank ? styles.bankSelectorText : styles.bankSelectorPlaceholder}>
              {selectedBank?.name ?? 'Select your bank'}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={Colors.onSurfaceMuted} />
        </TouchableOpacity>

        <Text style={[styles.label, styles.spaced]}>Account number</Text>
        <TextInput
          value={accountNumber}
          onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, '').slice(0, 10))}
          placeholder="10-digit account number"
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="number-pad"
          style={styles.input}
        />
        {resolving ? (
          <View style={styles.resolveRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.resolveText}>Resolving account name…</Text>
          </View>
        ) : resolvedName ? (
          <View style={styles.resolveRow}>
            <Icon name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={styles.resolvedName}>{resolvedName}</Text>
          </View>
        ) : null}

        <Text style={styles.disclosure}>Settlements arrive within 24 hours for verified merchants (instant for Gold tier and above).</Text>

        <Button label="Continue" trailingArrow onPress={handleContinue} disabled={!canSubmit} loading={saving} style={styles.submit} />
      </View>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerWrap}>
          <ScreenHeader title="Select Bank" onBack={() => setPickerOpen(false)} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search banks"
            placeholderTextColor={Colors.onSurfaceMuted}
            style={styles.searchInput}
          />
          <FlatList
            data={filteredBanks}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.bankRow}
                onPress={() => {
                  setSelectedBank(item);
                  setPickerOpen(false);
                  setSearch('');
                }}
              >
                <BankLogo code={item.code} name={item.name} size={32} />
                <Text style={styles.bankRowText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.pickerList}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  form: {
    paddingHorizontal: Spacing.xl,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  spaced: {
    marginTop: Spacing.lg,
  },
  bankSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  bankSelectorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bankSelectorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  bankSelectorPlaceholder: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceMuted,
  },
  input: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
  resolveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  resolveText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  resolvedName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.success,
  },
  disclosure: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.xl,
  },
  submit: {
    marginTop: Spacing.xl,
  },
  pickerWrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchInput: {
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
    marginBottom: Spacing.md,
  },
  pickerList: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  bankRowText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
});
