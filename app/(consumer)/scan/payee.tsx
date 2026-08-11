import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { BankLogo } from '@/components/ui/BankLogo';
import { usePaymentStore } from '@/store/payment';
import { isValidLenzTag, isValidNUBAN, resolvePayee } from '@/services/payee';
import { mockPayeeDirectory } from '@/mock/payees';
import { NIGERIAN_BANKS } from '@/mock/banks';
import type { Payee } from '@/types/orchestration';

type Mode = 'account' | 'tag';

/**
 * Manual payee entry (§3.3) with the name-confirmation fraud check (§3.2).
 *
 * The account number is checksum-validated locally before any lookup, so a
 * mistyped digit — the most common way money reaches the wrong person — is
 * caught without a network round-trip. Nothing proceeds to the amount screen
 * until the resolved name has been shown and explicitly confirmed.
 */
export default function PayeeScreen() {
  const router = useRouter();
  const setPayee = usePaymentStore((s) => s.setPayee);

  const [mode, setMode] = useState<Mode>('account');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [tag, setTag] = useState('');
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankQuery, setBankQuery] = useState('');

  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<Payee | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedBank = NIGERIAN_BANKS.find((bank) => bank.code === bankCode);

  // A Lenz Tag resolves to a payee whose bank the user never picked, so read
  // the name off the resolved payee rather than the picker's selection.
  const resolvedBankName = resolved?.bankCode
    ? NIGERIAN_BANKS.find((bank) => bank.code === resolved.bankCode)?.name ?? resolved.bankCode
    : undefined;

  const filteredBanks = useMemo(() => {
    const query = bankQuery.trim().toLowerCase();
    if (!query) return NIGERIAN_BANKS;
    return NIGERIAN_BANKS.filter((bank) => bank.name.toLowerCase().includes(query));
  }, [bankQuery]);

  // Local checksum feedback, shown as soon as all 10 digits are in.
  const checksumFailed =
    mode === 'account' &&
    accountNumber.length === 10 &&
    !!bankCode &&
    !isValidNUBAN(accountNumber, bankCode);

  const canResolve =
    mode === 'account'
      ? accountNumber.length === 10 && !!bankCode && !checksumFailed
      : isValidLenzTag(tag);

  const reset = useCallback(() => {
    setResolved(null);
    setError(null);
  }, []);

  const handleResolve = useCallback(async () => {
    setResolving(true);
    setError(null);
    setResolved(null);

    const result = await resolvePayee(
      mode === 'account'
        ? { type: 'account_number', value: accountNumber, bankCode }
        : { type: 'lenz_tag', value: tag },
      mockPayeeDirectory
    );

    setResolving(false);
    if (result.ok) setResolved(result.payee);
    else setError(result.reason);
  }, [mode, accountNumber, bankCode, tag]);

  const handleConfirm = useCallback(() => {
    if (!resolved) return;
    setPayee(resolved);
    router.push('/(consumer)/scan/amount');
  }, [resolved, setPayee, router]);

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Pay Anyone" subtitle="Enter an account number or Lenz Tag" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.toggleRow}>
          {(['account', 'tag'] as Mode[]).map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => {
                setMode(option);
                reset();
              }}
              style={[styles.toggleTab, mode === option && styles.toggleTabActive]}
            >
              <Text style={[styles.toggleText, mode === option && styles.toggleTextActive]}>
                {option === 'account' ? 'Account number' : 'Lenz Tag'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'account' ? (
          <>
            <Text style={styles.label}>Bank</Text>
            <TouchableOpacity
              style={styles.field}
              onPress={() => setBankPickerOpen((open) => !open)}
              accessibilityRole="button"
            >
              {selectedBank ? (
                <View style={styles.bankRow}>
                  <BankLogo code={selectedBank.code} name={selectedBank.name} size={22} />
                  <Text style={styles.fieldText}>{selectedBank.name}</Text>
                </View>
              ) : (
                <Text style={styles.fieldPlaceholder}>Select a bank</Text>
              )}
              <Icon
                name={bankPickerOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            {bankPickerOpen ? (
              <View style={styles.picker}>
                <TextInput
                  value={bankQuery}
                  onChangeText={setBankQuery}
                  placeholder="Search banks"
                  placeholderTextColor={Colors.onSurfaceMuted}
                  style={styles.search}
                />
                <ScrollView style={styles.pickerList} nestedScrollEnabled>
                  {filteredBanks.map((bank) => (
                    <TouchableOpacity
                      key={bank.code}
                      style={styles.pickerRow}
                      onPress={() => {
                        setBankCode(bank.code);
                        setBankPickerOpen(false);
                        setBankQuery('');
                        reset();
                      }}
                    >
                      <BankLogo code={bank.code} name={bank.name} size={20} />
                      <Text style={styles.pickerText}>{bank.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <Text style={styles.label}>Account number</Text>
            <View style={[styles.field, checksumFailed && styles.fieldError]}>
              <TextInput
                value={accountNumber}
                onChangeText={(text) => {
                  setAccountNumber(text.replace(/\D/g, '').slice(0, 10));
                  reset();
                }}
                placeholder="0123456789"
                placeholderTextColor={Colors.onSurfaceMuted}
                keyboardType="number-pad"
                maxLength={10}
                style={[styles.input, styles.mono]}
              />
              <Text style={styles.counter}>{accountNumber.length}/10</Text>
            </View>

            {checksumFailed ? (
              <View style={styles.inlineError}>
                <Icon name="alert-circle" size={14} color={Colors.errorDim} />
                <Text style={styles.inlineErrorText}>
                  That account number isn't valid for {selectedBank?.name ?? 'this bank'}. Check the
                  digits.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.label}>Lenz Tag</Text>
            <View style={styles.field}>
              <TextInput
                value={tag}
                onChangeText={(text) => {
                  setTag(text.toLowerCase().replace(/[^a-z0-9_@]/g, ''));
                  reset();
                }}
                placeholder="@merchant_name"
                placeholderTextColor={Colors.onSurfaceMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>
          </>
        )}

        {/* §3.2 — the payee's name is confirmed back to the user before any
            amount is entered or any money moves. */}
        {resolved ? (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Paying</Text>
            <View style={styles.confirmNameRow}>
              <Text style={styles.confirmName}>{resolved.displayName}</Text>
              {resolved.isVerified ? <Badge kind="VERIFIED" /> : null}
            </View>
            {resolved.accountNumber ? (
              <Text style={styles.confirmDetail}>
                {resolved.accountNumber} · {resolvedBankName ?? 'Unknown bank'}
              </Text>
            ) : null}
            {!resolved.isVerified ? (
              <View style={styles.unverifiedRow}>
                <Icon name="alert-circle" size={14} color={Colors.warning} />
                <Text style={styles.unverifiedText}>
                  We couldn't verify this payee. Only continue if you know them.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.inlineError}>
            <Icon name="alert-circle" size={14} color={Colors.errorDim} />
            <Text style={styles.inlineErrorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {resolved ? (
          <>
            <Button label="Confirm & Continue" trailingArrow onPress={handleConfirm} />
            <Button label="Change details" variant="tertiary" onPress={reset} />
          </>
        ) : (
          <Button
            label={resolving ? 'Checking…' : 'Find account'}
            onPress={handleResolve}
            disabled={!canResolve || resolving}
          />
        )}
        {resolving ? (
          <ActivityIndicator color={Colors.primary} style={styles.spinner} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  toggleTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  toggleTabActive: { backgroundColor: Colors.primary },
  toggleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  toggleTextActive: { color: Colors.onPrimary },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.lg,
    minHeight: 52,
  },
  fieldError: { borderColor: Colors.error },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  fieldText: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
    flexShrink: 1,
  },
  fieldPlaceholder: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurfaceMuted,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodyMd.fontSize,
    color: Colors.onSurface,
    paddingVertical: Spacing.md,
  },
  mono: { letterSpacing: 2 },
  counter: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceMuted,
  },
  picker: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  search: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  pickerList: { maxHeight: 240 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  pickerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
  confirmCard: {
    backgroundColor: Colors.surfaceBright,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginTop: Spacing.xxl,
    gap: Spacing.xs,
  },
  confirmLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
  },
  confirmNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  confirmName: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
    flexShrink: 1,
  },
  confirmDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  unverifiedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  unverifiedText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.warning,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  inlineErrorText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.errorDim,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  spinner: { marginTop: Spacing.sm },
});
