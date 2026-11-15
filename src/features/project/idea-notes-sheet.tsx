import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

import { setIdeaNotes, useEditorStore } from './editor-store';
import { hasNotes, insertTimeStamp, splitTimeStamps } from './idea-notes';
import { playheadTime, seekTo } from './transport-link';

/** How long typing pauses before the notes are saved (they're also saved when the sheet closes). */
export const NOTES_SAVE_DELAY_MS = 800;

type Selection = { start: number; end: number };
/** The text not yet saved and its save timer, shared by the debounce and the save on close. */
type Pending = { text: string; timer: ReturnType<typeof setTimeout> | null };

/**
 * The idea's notes (T24): what was played (chords, tuning, capo, lyric ideas), to rebuild the song
 * later. Editing is a plain multiline field with "Insert time", which writes the playhead time as
 * `[1:23]` at the cursor; outside editing, each time stamp is a link that moves the playhead there
 * (also while playing). Saved debounced and when the sheet closes; not an undo step.
 */
export function IdeaNotesSheet() {
  const params = useLocalSearchParams<{ id: string }>();
  const notes = useEditorStore((state) =>
    state.projectId === params.id ? state.project?.notes : undefined,
  );
  return notes === undefined ? null : <NotesEditor key={params.id} initial={notes} />;
}

function NotesEditor({ initial }: { initial: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(!hasNotes(initial));
  // The cursor, kept from the field's events; `forcedSelection` moves it (after an insert, on edit).
  const selection = useRef<Selection>({ start: initial.length, end: initial.length });
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(undefined);
  const pending = useRef<Pending>({ text: initial, timer: null });
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const current = pending.current;
    return () => saveNow(current);
  }, []);

  const change = (next: string) => {
    setText(next);
    const current = pending.current;
    current.text = next;
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => saveNow(current), NOTES_SAVE_DELAY_MS);
  };

  const startEditing = () => {
    const end = { start: text.length, end: text.length };
    selection.current = end;
    setForcedSelection(end);
    setEditing(true);
  };

  const finishEditing = () => {
    saveNow(pending.current);
    setEditing(false);
  };

  const insertTime = () => {
    void Haptics.selectionAsync();
    const result = insertTimeStamp(text, selection.current, playheadTime());
    change(result.text);
    const cursor = { start: result.cursor, end: result.cursor };
    selection.current = cursor;
    setForcedSelection(cursor);
  };

  const header = (
    <View style={styles.header}>
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        Notes
      </Text>
      {editing ? (
        <>
          <HeaderButton
            label="Insert time"
            icon={{ ios: 'clock', android: 'schedule' }}
            onPress={insertTime}
          />
          <HeaderButton label="Done" onPress={() => input.current?.blur()} />
        </>
      ) : (
        <HeaderButton label="Edit" onPress={startEditing} />
      )}
    </View>
  );

  if (editing) {
    return (
      <View style={styles.root}>
        {header}
        <TextInput
          ref={input}
          accessibilityLabel="Idea notes"
          placeholder="Chords, tuning, capo, lyric ideas…"
          multiline
          autoFocus
          value={text}
          selection={forcedSelection}
          onChangeText={change}
          onSelectionChange={(event) => {
            selection.current = event.nativeEvent.selection;
            if (forcedSelection) setForcedSelection(undefined);
          }}
          onBlur={finishEditing}
          textAlignVertical="top"
          placeholderTextColor={theme.colors.textTertiary}
          style={styles.input}
        />
        <Text variant="footnote" color="textSecondary">
          Insert time adds the playhead time. Tap a time later to jump there.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <ScrollView style={styles.reader} contentContainerStyle={styles.readerContent}>
        {/* Tapping the text edits it; not one accessibility element, so screen readers reach each
            time link (and edit with the Edit button). */}
        <Pressable accessible={false} onPress={startEditing}>
          {hasNotes(text) ? (
            <Text>
              {splitTimeStamps(text).map((segment, index) =>
                segment.time === null ? (
                  segment.text
                ) : (
                  <Text
                    // Segments never reorder, so the index is a stable key.
                    key={index}
                    accessibilityRole="link"
                    accessibilityLabel={`Go to ${segment.text.slice(1, -1)}`}
                    color="primary"
                    style={styles.stamp}
                    suppressHighlighting={false}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      seekTo(segment.time ?? 0);
                    }}>
                    {segment.text}
                  </Text>
                ),
              )}
            </Text>
          ) : (
            <Text color="textTertiary">No notes yet. Tap to add some.</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function saveNow(pending: Pending) {
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = null;
  void setIdeaNotes(pending.text);
}

function HeaderButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={16} color="primary" /> : null}
      <Text variant="headline" color="primary">
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, padding: t.spacing.lg, paddingTop: t.spacing.xl, gap: t.spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg },
  title: { flex: 1 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  input: {
    ...t.typography.body,
    flex: 1,
    minHeight: 120,
    color: t.colors.text,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.sm,
  },
  reader: { flex: 1 },
  readerContent: { paddingBottom: t.spacing.xl },
  stamp: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
}));
