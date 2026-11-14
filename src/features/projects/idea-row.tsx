import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon, ListRow, Text, type IconName } from '@/components/ui';
import { formatDuration } from '@/features/audio/format-time';
import { makeStyles } from '@/theme';

import type { IdeaAction } from './idea-actions';
import { formatIdeaDate } from './ideas-list';
import type { ProjectSummary } from './projects-repo';

type Props = {
  idea: ProjectSummary;
  /** Which date to show under the name. */
  dateKind: 'updated' | 'created';
  onOpen: () => void;
  onAction: (action: IdeaAction) => void;
  onLongPress: () => void;
};

const ACTIONS: {
  action: IdeaAction;
  label: string;
  icon: IconName;
  tone: 'neutral' | 'primary' | 'danger';
}[] = [
  { action: 'rename', label: 'Rename', icon: { ios: 'pencil', android: 'edit' }, tone: 'neutral' },
  {
    action: 'duplicate',
    label: 'Duplicate',
    icon: { ios: 'plus.square.on.square', android: 'content_copy' },
    tone: 'primary',
  },
  { action: 'delete', label: 'Delete', icon: { ios: 'trash', android: 'delete' }, tone: 'danger' },
];

/** One idea in the list: tap to open, swipe left for Rename / Duplicate / Delete, long-press for the same menu. */
export function IdeaRow({ idea, dateKind, onOpen, onAction, onLongPress }: Props) {
  const styles = useStyles();
  const swipeable = useRef<SwipeableMethods>(null);
  const date = formatIdeaDate(dateKind === 'created' ? idea.createdAt : idea.updatedAt);

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      overshootRight={false}
      rightThreshold={40}
      childrenContainerStyle={styles.content}
      renderRightActions={() => (
        <View style={styles.actions}>
          {ACTIONS.map(({ action, label, icon, tone }) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${idea.name}`}
              onPress={() => {
                swipeable.current?.close();
                onAction(action);
              }}
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
      )}>
      <ListRow
        title={idea.name}
        subtitle={date}
        value={formatDuration(idea.duration)}
        onPress={onOpen}
        onLongPress={onLongPress}
      />
    </ReanimatedSwipeable>
  );
}

const useStyles = makeStyles((t) => ({
  content: { backgroundColor: t.colors.surface },
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
