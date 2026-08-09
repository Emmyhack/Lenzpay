import { useState, useMemo, useCallback } from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MOCK_NOTIFICATIONS, type AppNotification, type NotificationKind } from '@/mock/notifications';

const KIND_ACCENT: Record<NotificationKind, string> = {
  fraud: Colors.error,
  payment: Colors.success,
  points: Colors.primary,
};

const KIND_ICON: Record<NotificationKind, IconName> = {
  fraud: 'warning',
  payment: 'cash-outline',
  points: 'star',
};

function isToday(date: Date) {
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function NotificationCard({ notification, onDismiss }: { notification: AppNotification; onDismiss: () => void }) {
  const accent = KIND_ACCENT[notification.kind];

  return (
    <Swipeable
      renderRightActions={() => (
        <View style={[styles.dismissAction, { backgroundColor: accent }]}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </View>
      )}
      onSwipeableOpen={onDismiss}
    >
      <View style={[styles.card, { backgroundColor: accent + '14', borderLeftColor: accent }]}>
        <Icon name={KIND_ICON[notification.kind]} size={20} color={accent} />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{notification.title}</Text>
          <Text style={styles.cardText}>{notification.body}</Text>
          <Text style={styles.cardTime}>{formatTime(notification.timestamp)}</Text>
        </View>
      </View>
    </Swipeable>
  );
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const handleDismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const sections = useMemo(() => {
    const today = notifications.filter((n) => isToday(n.timestamp));
    const earlier = notifications.filter((n) => !isToday(n.timestamp));
    const result: { title: string; data: AppNotification[] }[] = [];
    if (today.length) result.push({ title: 'TODAY', data: today });
    if (earlier.length) result.push({ title: 'EARLIER', data: earlier });
    return result;
  }, [notifications]);

  return (
    <View style={styles.wrap}>
      <ScreenHeader title="Notifications" />
      {sections.length === 0 ? (
        <EmptyState icon="checkmark-done-circle-outline" title="You're all caught up" message="No new notifications." />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <NotificationCard notification={item} onDismiss={() => handleDismiss(item.id)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  sectionHeader: {
    fontFamily: 'Inter_400Regular',
    fontSize: Typography.labelSm.fontSize,
    letterSpacing: Typography.labelSm.letterSpacing,
    color: Colors.onSurfaceMuted,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderLeftWidth: 3,
    padding: Spacing.lg,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.onSurface,
  },
  cardText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  cardTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.onSurfaceMuted,
    marginTop: Spacing.xs,
  },
  dismissAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
  },
  dismissText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#fff',
  },
});
