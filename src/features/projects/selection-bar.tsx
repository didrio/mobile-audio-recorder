import { Stack } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

export type SelectionAction = {
  id: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * Select mode's actions (Move, Delete; T37 adds Export): the native bottom toolbar on iOS, a plain bar at
 * the bottom of the screen on Android (where the tab bar takes its own space).
 */
export function SelectionBar({ actions }: { actions: SelectionAction[] }) {
  const styles = useStyles();
  const theme = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <Stack.Toolbar placement="bottom">
        {actions.flatMap((action, index) => [
          ...(index > 0 ? [<Stack.Toolbar.Spacer key={`spacer-${action.id}`} />] : []),
          <Stack.Toolbar.Button
            key={action.id}
            icon={action.icon.ios}
            accessibilityLabel={action.label}
            disabled={action.disabled}
            {...(action.destructive && { tintColor: theme.colors.danger })}
            onPress={action.onPress}>
            {action.label}
          </Stack.Toolbar.Button>,
        ])}
      </Stack.Toolbar>
    );
  }

  return (
    <View style={styles.bar}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.disabled }}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.action,
            action.disabled && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Icon name={action.icon} size={22} color={action.destructive ? 'danger' : 'primary'} />
          <Text variant="footnote" color={action.destructive ? 'danger' : 'primary'}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
    paddingVertical: t.spacing.sm,
  },
  action: { alignItems: 'center', gap: t.spacing.xs, paddingHorizontal: t.spacing.lg },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
