import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pill segmented control. Extracted from the hand-rolled Auto/Manual toggle in
 * the scan flow so tab-style switches look identical wherever they appear.
 */
export function Segmented<T extends string>({ options, value, onChange, style }: SegmentedProps<T>) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={14}
                color={selected ? Colors.onPrimary : Colors.onSurfaceVariant}
              />
            ) : null}
            <Text style={[styles.label, selected && styles.labelActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  tabActive: { backgroundColor: Colors.primary },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  labelActive: { color: Colors.onPrimary },
});
