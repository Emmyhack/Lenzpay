import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ToastLib, { BaseToastProps } from 'react-native-toast-message';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

type ToastKind = 'success' | 'error' | 'info';

const ACCENT: Record<ToastKind, string> = {
  success: Colors.success,
  error: Colors.error,
  info: Colors.secondary,
};

const TOAST_ICON: Record<ToastKind, IconName> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

function ToastCard({ type, text1, text2 }: BaseToastProps & { type: ToastKind }) {
  return (
    <View style={[styles.card, { borderLeftColor: ACCENT[type] }]}>
      <Icon name={TOAST_ICON[type]} size={18} color={ACCENT[type]} />
      <View style={styles.textWrap}>
        {text1 ? <Text style={styles.title}>{text1}</Text> : null}
        {text2 ? <Text style={styles.message}>{text2}</Text> : null}
      </View>
    </View>
  );
}

export const toastConfig = {
  success: (props: BaseToastProps) => <ToastCard {...props} type="success" />,
  error: (props: BaseToastProps) => <ToastCard {...props} type="error" />,
  info: (props: BaseToastProps) => <ToastCard {...props} type="info" />,
};

export function showToast(type: ToastKind, text1: string, text2?: string) {
  ToastLib.show({ type, text1, text2 });
}

const styles = StyleSheet.create({
  card: {
    width: '90%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurface,
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});
