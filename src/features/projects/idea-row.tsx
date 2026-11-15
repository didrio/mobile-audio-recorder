import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon, ListRow, Text } from '@/components/ui';
import { formatDuration } from '@/features/audio/format-time';
import { makeStyles } from '@/theme';

import { ROW_ACTIONS, type IdeaAction } from './idea-actions';
import { formatIdeaDate } from './ideas-list';
import type { ProjectSummary } from './projects-repo';
import { SwipeActions } from './swipe-actions';

type Props = {
  idea: ProjectSummary;
  /** Which date to show under the name. */
  dateKind: 'updated' | 'created';
  /** While searching: the bit of the notes that matched (`notesMatch`), shown after the date. */
  match?: string | null;
  /** The folder it lives in ("Demos › Rough"), shown while searching and in Favorites. */
  path?: string | null;
  /** Select mode: `undefined` = not selecting; tapping toggles instead of opening. */
  selected?: boolean;
  onOpen: () => void;
  onAction: (action: IdeaAction) => void;
  onLongPress: () => void;
};

/**
 * One idea in the list: tap to open, swipe left for Rename / Duplicate / Delete, swipe right to star it,
 * long-press for the full menu. A star by the length marks a favorite.
 */
export function IdeaRow({
  idea,
  dateKind,
  match,
  path,
  selected,
  onOpen,
  onAction,
  onLongPress,
}: Props) {
  const styles = useStyles();
  const swipeable = useRef<SwipeableMethods>(null);
  const date = formatIdeaDate(dateKind === 'created' ? idea.createdAt : idea.updatedAt);
  const subtitle = [date, path, match].filter(Boolean).join(' · ');
  const selecting = selected !== undefined;
  const run = (action: IdeaAction) => {
    swipeable.current?.close();
    onAction(action);
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      enabled={!selecting}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={40}
      rightThreshold={40}
      childrenContainerStyle={styles.content}
      renderLeftActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${idea.favorite ? 'Unfavorite' : 'Favorite'} ${idea.name}`}
          onPress={() => run('favorite')}
          style={styles.favoriteAction}>
          <Icon
            name={
              idea.favorite
                ? { ios: 'star.slash', android: 'star_border' }
                : { ios: 'star.fill', android: 'star' }
            }
            size={20}
            color="onPrimary"
          />
          <Text variant="footnote" color="onPrimary">
            {idea.favorite ? 'Unfavorite' : 'Favorite'}
          </Text>
        </Pressable>
      )}
      renderRightActions={() => (
        <SwipeActions name={idea.name} actions={ROW_ACTIONS} onAction={run} />
      )}>
      <ListRow
        title={idea.name}
        subtitle={subtitle}
        icon={
          selecting
            ? selected
              ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
              : { ios: 'circle', android: 'radio_button_unchecked' }
            : undefined
        }
        selected={selected}
        accessory={
          <View style={styles.trailing}>
            {idea.favorite ? (
              <Icon
                name={{ ios: 'star.fill', android: 'star' }}
                size={12}
                color="favorite"
                accessibilityLabel="Favorite"
              />
            ) : null}
            <Text color="textSecondary">{formatDuration(idea.duration)}</Text>
          </View>
        }
        onPress={onOpen}
        onLongPress={onLongPress}
      />
    </ReanimatedSwipeable>
  );
}

const useStyles = makeStyles((t) => ({
  content: { backgroundColor: t.colors.surface },
  trailing: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: t.spacing.xs,
  },
  favoriteAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xs,
    backgroundColor: t.colors.favorite,
  },
}));
