import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui';
import { SectionSwatches } from '@/features/project/section-swatches';
import type { SectionColor } from '@/features/project/sections';
import { makeStyles } from '@/theme';

import { ActionBar, ActionBarButton } from './action-bar';

/**
 * The floating bar for the selected section (T18): Rename, Color, Notes and Delete. Color swaps the
 * buttons for the palette; picking a color recolors the section and brings the buttons back.
 */
export function SectionActionBar({
  color,
  hasNotes,
  onRename,
  onColor,
  onNotes,
  onDelete,
}: {
  color: SectionColor;
  hasNotes: boolean;
  onRename: () => void;
  onColor: (color: SectionColor) => void;
  onNotes: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const [picking, setPicking] = useState(false);

  if (picking) {
    return (
      <ActionBar label="Section color">
        <View style={styles.swatches}>
          <SectionSwatches
            value={color}
            size={26}
            onChange={(next) => {
              onColor(next);
              setPicking(false);
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          hitSlop={6}
          onPress={() => setPicking(false)}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon name={{ ios: 'xmark', android: 'close' }} size={16} color="textSecondary" />
        </Pressable>
      </ActionBar>
    );
  }

  return (
    <ActionBar label="Section actions">
      <ActionBarButton
        label="Rename"
        icon={{ ios: 'pencil', android: 'edit' }}
        compact
        onPress={onRename}
      />
      <ActionBarButton
        label="Color"
        icon={{ ios: 'paintpalette', android: 'palette' }}
        compact
        onPress={() => setPicking(true)}
      />
      <ActionBarButton
        label="Notes"
        hint={hasNotes ? 'Shows the section’s note' : 'Adds a note to the section'}
        icon={{ ios: 'note.text', android: 'notes' }}
        compact
        onPress={onNotes}
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

const useStyles = makeStyles((t) => ({
  swatches: { paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.xs },
  close: { padding: t.spacing.sm, borderRadius: t.radius.full },
  pressed: { opacity: 0.6 },
}));
