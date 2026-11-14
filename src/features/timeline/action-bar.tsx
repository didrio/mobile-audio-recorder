import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { makeStyles } from '@/theme';

/** The floating pill under a selected clip or section, holding its `ActionBarButton`s. */
export function ActionBar({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.bar} accessibilityRole="toolbar" accessibilityLabel={label}>
      {children}
    </View>
  );
}

export function ActionBarButton({
  label,
  hint,
  icon,
  disabled = false,
  destructive = false,
  compact = false,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: IconName;
  disabled?: boolean;
  destructive?: boolean;
  /** Less padding, so four buttons fit a narrow time area. */
  compact?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const color = destructive ? 'danger' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        compact && styles.compact,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Icon name={icon} size={18} color={color} />
      <Text variant="footnote" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    padding: t.spacing.xxs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.18)',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.full,
  },
  compact: { paddingHorizontal: t.spacing.sm },
  pressed: { backgroundColor: t.colors.surfacePressed },
  disabled: { opacity: 0.35 },
}));
