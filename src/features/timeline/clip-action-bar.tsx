import { ActionBar, ActionBarButton } from './action-bar';

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
  return (
    <ActionBar label="Clip actions">
      <ActionBarButton
        label="Split"
        hint="Splits the clip at the playhead"
        icon={{ ios: 'scissors', android: 'content_cut' }}
        disabled={!canSplit}
        onPress={onSplit}
      />
      <ActionBarButton
        label="Duplicate"
        hint="Places a copy right after the clip"
        icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
        onPress={onDuplicate}
      />
      <ActionBarButton
        label="Delete"
        icon={{ ios: 'trash', android: 'delete' }}
        destructive
        onPress={onDelete}
      />
    </ActionBar>
  );
}
