import { ActionBar, ActionBarButton } from './action-bar';

/**
 * The floating bar for the selected clip: Split (at the playhead, only when it's inside the clip),
 * Duplicate, Options (gain, fades, restore: the clip options sheet, T16) and Delete.
 */
export function ClipActionBar({
  canSplit,
  onSplit,
  onDuplicate,
  onOptions,
  onDelete,
}: {
  canSplit: boolean;
  onSplit: () => void;
  onDuplicate: () => void;
  onOptions: () => void;
  onDelete: () => void;
}) {
  return (
    <ActionBar label="Clip actions">
      <ActionBarButton
        label="Split"
        hint="Splits the clip at the playhead"
        icon={{ ios: 'scissors', android: 'content_cut' }}
        disabled={!canSplit}
        compact
        onPress={onSplit}
      />
      <ActionBarButton
        label="Duplicate"
        hint="Places a copy right after the clip"
        icon={{ ios: 'plus.square.on.square', android: 'content_copy' }}
        compact
        onPress={onDuplicate}
      />
      <ActionBarButton
        label="Options"
        hint="Gain, fades and restoring the full take"
        icon={{ ios: 'slider.horizontal.3', android: 'tune' }}
        compact
        onPress={onOptions}
      />
      <ActionBarButton
        label="Delete"
        icon={{ ios: 'trash', android: 'delete' }}
        destructive
        compact
        onPress={onDelete}
      />
    </ActionBar>
  );
}
