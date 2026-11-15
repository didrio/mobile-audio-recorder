import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import type { RowAction } from './idea-actions';

/** The buttons revealed by swiping a row left (ideas and folders). */
export function SwipeActions<A extends string>({
  name,
  actions,
  onAction,
}: {
  /** The row's name, for each button's label ("Delete Demos"). */
  name: string;
  actions: RowAction<A>[];
  onAction: (action: A) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.actions}>
      {actions.map(({ action, label, icon, tone }) => (
        <Pressable
          key={action}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${name}`}
          onPress={() => onAction(action)}
          style={[
            styles.action,
            tone === 'danger' && styles.actionDanger,
            tone === 'primary' && styles.actionPrimary,
          ]}>
          <Icon name={icon} size={20} color="onPrimary" />
          <Text variant="footnote" color="onPrimary">
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  actions: { flexDirection: 'row' },
  action: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xs,
    backgroundColor: t.colors.textSecondary,
  },
  actionPrimary: { backgroundColor: t.colors.primary },
  actionDanger: { backgroundColor: t.colors.danger },
}));
