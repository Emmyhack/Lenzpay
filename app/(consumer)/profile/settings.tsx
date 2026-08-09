import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { ToggleRow } from '@/components/shared/ToggleRow';

export default function SettingsScreen() {
  const [pushNotifications, setPushNotifications] = useState(true);
  const [transactionAlerts, setTransactionAlerts] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionTitle title="Notifications" />
          <View style={styles.card}>
            <ToggleRow title="Push notifications" subtitle="Payment confirmations and alerts" value={pushNotifications} onValueChange={setPushNotifications} />
            <ToggleRow title="Transaction alerts" subtitle="Every debit and credit" value={transactionAlerts} onValueChange={setTransactionAlerts} />
            <ToggleRow title="Marketing emails" subtitle="Product updates and offers" value={marketingEmails} onValueChange={setMarketingEmails} last />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="About" />
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>App version</Text>
              <Text style={styles.aboutValue}>{appVersion}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Spacing.xxxl,
  },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  aboutLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurfaceVariant,
  },
  aboutValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: Typography.bodySm.fontSize,
    color: Colors.onSurface,
  },
});
