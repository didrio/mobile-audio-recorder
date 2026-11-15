import { useRef } from 'react';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ListRow } from '@/components/ui';
import { makeStyles } from '@/theme';

import { FOLDER_ROW_ACTIONS, type FolderAction } from './idea-actions';
import { SwipeActions } from './swipe-actions';

type Props = {
  name: string;
  /** How many folders and ideas are directly inside. */
  count: number;
  /** Where it lives ("Demos › Rough"), shown while searching. */
  path?: string | null;
  /** Select mode: `undefined` = not selecting; tapping toggles instead of opening. */
  selected?: boolean;
  onOpen: () => void;
  onAction: (action: FolderAction) => void;
  onLongPress: () => void;
};

/** One folder in the Ideas list: tap to open, swipe left for Rename / Delete, long-press for the menu. */
export function FolderRow({ name, count, path, selected, onOpen, onAction, onLongPress }: Props) {
  const styles = useStyles();
  const swipeable = useRef<SwipeableMethods>(null);
  const selecting = selected !== undefined;

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      enabled={!selecting}
      overshootRight={false}
      rightThreshold={40}
      childrenContainerStyle={styles.content}
      renderRightActions={() => (
        <SwipeActions
          name={name}
          actions={FOLDER_ROW_ACTIONS}
          onAction={(action) => {
            swipeable.current?.close();
            onAction(action);
          }}
        />
      )}>
      <ListRow
        title={name}
        subtitle={path ?? undefined}
        icon={
          selecting
            ? selected
              ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
              : { ios: 'circle', android: 'radio_button_unchecked' }
            : { ios: 'folder', android: 'folder' }
        }
        selected={selected}
        value={String(count)}
        onPress={onOpen}
        onLongPress={onLongPress}
      />
    </ReanimatedSwipeable>
  );
}

const useStyles = makeStyles((t) => ({
  content: { backgroundColor: t.colors.surface },
}));
