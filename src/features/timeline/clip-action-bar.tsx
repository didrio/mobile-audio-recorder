import { Pressable, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { makeStyles } from '@/theme';

/**
 * The floating bar for the selected clip: Split (at the playhead, only when it's inside the clip),
 * Duplicate and Delete. T16 adds "Options…".
 */
export function ClipActionBar({
  canSplit,
  onSplit,
  onDuplicate,
  onDelete,
}: {
  canSplit: boolean;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.bar} accessibilityRole="toolbar" accessibilityLabel="Clip actions">
      <Action
        label="Split"
        hint="Splits the clip at the playhead"
        icon={{ ios: 'scissors', android: 'content_cut' }}
        disabled={!canSplit}
        onPress={onSplit}
      />
      <Action
        label="Duplicate"
        hint="Places a copy right after the clip"
        icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
        onPress={onDuplicate}
      />
      <Action
        label="Delete"
        icon={{ ios: 'trash', android: 'delete' }}
        destructive
        onPress={onDelete}
      />
    </View>
  );
}

function Action({
  label,
  hint,
  icon,
  disabled = false,
  destructive = false,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: IconName;
  disabled?: boolean;
  destructive?: boolean;
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
  pressed: { backgroundColor: t.colors.surfacePressed },
  disabled: { opacity: 0.35 },
}));
