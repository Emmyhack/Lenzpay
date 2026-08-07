import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { Badge, type BadgeKind } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Merchant } from '@/types/payment';

interface MerchantSheetProps {
  merchant: Merchant;
  onContinue: () => void;
  onScanAgain: () => void;
}

export function MerchantSheet({ merchant, onContinue, onScanAgain }: MerchantSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['48%'], []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onScanAgain();
    },
    [onScanAgain]
  );

  return (
    <View style={styles.overlay}>
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.content}>
          <View style={styles.merchantHeader}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconGlyph}>{merchant.icon}</Text>
            </View>
            <Text style={styles.merchantName}>{merchant.name}</Text>
            {merchant.isVerified ? <Badge kind="VERIFIED" /> : null}
            <Text style={styles.location}>{merchant.location}</Text>
          </View>

          <Text style={styles.acceptsLabel}>Accepts</Text>
          <View style={styles.currencyRow}>
            {merchant.acceptedCurrencies.map((code) => (
              <Badge key={code} kind={code as BadgeKind} />
            ))}
          </View>

          <Button label="Continue to Pay →" onPress={onContinue} style={styles.continueButton} />
          <Button label="Scan Again" variant="secondary" onPress={onScanAgain} />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  sheetBackground: {
    backgroundColor: Colors.surfaceBright,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  handle: {
    backgroundColor: Colors.outlineVariant,
    width: 40,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  merchantHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  iconGlyph: { fontSize: 28 },
  merchantName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: Typography.headlineSm.fontSize,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
  },
  location: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.xs,
  },
  acceptsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  continueButton: {
    marginBottom: Spacing.md,
  },
});
