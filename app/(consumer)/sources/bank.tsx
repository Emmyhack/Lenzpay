import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { useSourcesStore } from '@/store/sources';
import { addBankSource } from '@/services/sources';
import { NIGERIAN_BANKS, type NigerianBank } from '@/mock/banks';
import { showToast } from '@/components/ui/Toast';

type AccountType = 'savings' | 'current';

export default function AddBankScreen() {
  const router = useRouter();
  const addSource = useSourcesStore((s) => s.addSource);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<NigerianBank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('savings');
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [linking, setLinking] = useState(false);

  const filteredBanks = NIGERIAN_BANKS.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    setResolvedName(null);
    if (accountNumber.length !== 10 || !selectedBank) return;
    setResolving(true);
    const timer = setTimeout(() => {
      // Mock name resolution — replace with a real BVN/NUBAN lookup endpoint.
      setResolvedName('Ada Okafor');
      setResolving(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [accountNumber, selectedBank]);

  const canSubmit = !!selectedBank && accountNumber.length === 10 && !!resolvedName;

  const handleLink = async () => {
    if (!selectedBank) return;
    setLinking(true);
    const source = await addBankSource(accountNumber, selectedBank.code);
    addSource({ ...source, label: selectedBank.name });
    setLinking(false);
    showToast('success', 'Bank linked', `${selectedBank.name} added to your sources.`);
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Add Nigerian Bank" />

      <View style={styles.form}>
        <Text style={styles.label}>Bank</Text>
        <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.bankSelector}>
          <Text style={selectedBank ? styles.bankSelectorText : styles.bankSelectorPlaceholder}>
            {selectedBank?.name ?? 'Select your bank'}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <Text style={[styles.label, styles.spaced]}>Account number</Text>
        <TextInput
          value={accountNumber}
          onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, '').slice(0, 10))}
          placeholder="10-digit account number"
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="number-pad"
          style={styles.input}
          accessibilityLabel="Account number"
        />
        {resolving ? (
          <View style={styles.resolveRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.resolveText}>Resolving account name…</Text>
          </View>
        ) : resolvedName ? (
          <Text style={styles.resolvedName}>✓ {resolvedName}</Text>
        ) : null}

        <Text style={[styles.label, styles.spaced]}>Account type</Text>
        <View style={styles.typeRow}>
          {(['savings', 'current'] as AccountType[]).map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setAccountType(type)}
              style={[styles.typeOption, accountType === type && styles.typeOptionActive]}
            >
              <Text style={[styles.typeText, accountType === type && styles.typeTextActive]}>
                {type === 'savings' ? 'Savings' : 'Current'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button label="Link Account →" onPress={handleLink} disabled={!canSubmit} loading={linking} style={styles.submit} />
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
            accessibilityLabel="Search banks"
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
  chevron: {
    color: Colors.onSurfaceMuted,
    fontSize: 18,
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
    marginTop: Spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  typeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeOptionActive: {
    borderColor: Colors.primary,
  },
  typeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  typeTextActive: {
    color: Colors.primary,
  },
  submit: {
    marginTop: Spacing.xxl,
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  bankRowText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
  },
});
