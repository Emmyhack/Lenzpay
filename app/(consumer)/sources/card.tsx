import { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useSourcesStore } from '@/store/sources';
import { showToast } from '@/components/ui/Toast';
import { NIGERIAN_BANKS } from '@/mock/banks';

/**
 * Add a card.
 *
 * Cards matter to this product for one architectural reason: they are the only
 * rail on the launch corridor that can genuinely *authorise* funds without
 * moving them (ADR-012). Every Nigerian bank leg has to be float-backed; a card
 * leg can carry a real hold. So the screen says so, rather than presenting a
 * card as just another balance.
 *
 * The trade is the other half of that: an issuer will not tell us the available
 * balance. `rawBalance` here is the limit the user declares, and it stays a
 * declared figure — `balanceCertainty` scores it at zero — until `prepare()`
 * gets an authorisation that proves the funds were there.
 */

const PAN_LENGTH = 16;

export default function AddCardScreen() {
  const router = useRouter();
  const addSource = useSourcesStore((s) => s.addSource);

  const [pan, setPan] = useState('');
  const [limit, setLimit] = useState('');

  const digits = pan.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  const declaredLimit = Number(limit.replace(/\D/g, '')) || 0;
  const canSubmit = digits.length === PAN_LENGTH && declaredLimit > 0;

  const issuer = detectIssuer(digits);

  const handleLink = () => {
    if (!canSubmit) return;

    addSource({
      id: `src_card_${Date.now()}`,
      type: 'card',
      label: issuer?.name ?? 'Card',
      accountMask: `*${last4}`,
      currency: 'NGN',
      // Shown as spending headroom, not as money we can see. The engine treats
      // it as a declared limit rather than a verified balance.
      balance: declaredLimit,
      rawBalance: declaredLimit,
      rawCurrency: 'NGN',
      isDefault: false,
      bankCode: issuer?.code,
      flag: '🇳🇬',
      lastSynced: new Date(),
      // Below bank and wallet by default: a card can guarantee more, but on a
      // naira payment it is usually the more expensive way to move money.
      priorityWeight: 60,
    });

    showToast('success', `${issuer?.name ?? 'Card'} •••• ${last4} added`);
    router.back();
  };

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Add Card" />

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.note}>
          <Icon name="lock-closed" size={14} color={Colors.primary} />
          <Text style={styles.noteText}>
            A card is the one source we can put a genuine hold on. Payments funded
            this way are authorised before they are taken.
          </Text>
        </View>

        <Text style={styles.label}>CARD NUMBER</Text>
        <TextInput
          value={formatPan(digits)}
          onChangeText={(next) => setPan(next.replace(/\D/g, '').slice(0, PAN_LENGTH))}
          placeholder="0000 0000 0000 0000"
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="number-pad"
          style={styles.input}
          maxLength={19}
        />
        {issuer ? <Text style={styles.issuer}>{issuer.name}</Text> : null}

        <Text style={[styles.label, styles.labelSpaced]}>SPENDING LIMIT</Text>
        <TextInput
          value={limit}
          onChangeText={(next) => setLimit(next.replace(/\D/g, '').slice(0, 9))}
          placeholder="150000"
          placeholderTextColor={Colors.onSurfaceMuted}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Your issuer won’t share this card’s balance with us, so we use the limit
          you set here when planning a payment. We confirm the real funds with your
          bank before anything is charged.
        </Text>

        <Button
          label="Add Card"
          trailingArrow
          onPress={handleLink}
          disabled={!canSubmit}
          style={styles.submit}
        />
      </ScrollView>
    </View>
  );
}

function formatPan(digits: string): string {
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/** Match the issuer by NIBSS code so the card renders its real bank logo. */
function detectIssuer(digits: string): { name: string; code: string } | null {
  if (digits.length < 6) return null;
  // Mock: a stable pick from the leading digits, standing in for a real BIN
  // lookup. A production build resolves the BIN with the acquirer.
  const bank = NIGERIAN_BANKS[Number(digits.slice(0, 6)) % NIGERIAN_BANKS.length];
  return bank ? { name: `${bank.name} Card`, code: bank.code } : null;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  body: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  noteText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: Colors.onSurfaceVariant,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.onSurfaceMuted,
    marginBottom: Spacing.xs,
  },
  labelSpaced: {
    marginTop: Spacing.xl,
  },
  input: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: Typography.titleMd.fontSize,
    color: Colors.onSurface,
  },
  issuer: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.sm,
  },
  submit: {
    marginTop: Spacing.xxl,
  },
});
