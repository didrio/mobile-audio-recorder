import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

import { setSectionNotes, useEditorStore } from './editor-store';

/**
 * A section's note (T18): free text such as its chords or a lyric cue, opened from the section's action
 * bar. Saved as one undo step when the field loses focus or the sheet closes.
 */
export function SectionNotesSheet() {
  const params = useLocalSearchParams<{ id: string; projectId: string }>();
  const section = useEditorStore((state) =>
    state.projectId === params.projectId
      ? state.project?.sections.find((candidate) => candidate.id === params.id)
      : undefined,
  );
  return section ? <NotesForm key={section.id} section={section} /> : null;
}

function NotesForm({ section }: { section: { id: string; name: string; notes: string } }) {
  const styles = useStyles();
  const theme = useTheme();
  const [notes, setNotes] = useState(section.notes);
  // The text now and what was saved last (blurring and then closing saves once).
  const draft = useRef({ text: section.notes, saved: section.notes });

  const id = section.id;
  useEffect(() => {
    const current = draft.current;
    return () => saveDraft(id, current);
  }, [id]);

  return (
    <View style={styles.root}>
      <Text variant="headline" accessibilityRole="header" align="center" numberOfLines={1}>
        {section.name}
      </Text>
      <TextInput
        accessibilityLabel={`Notes for ${section.name}`}
        placeholder="Chords, lyrics, anything to remember"
        multiline
        autoFocus={!section.notes}
        value={notes}
        onChangeText={(text) => {
          setNotes(text);
          draft.current.text = text;
        }}
        onBlur={() => saveDraft(id, draft.current)}
        textAlignVertical="top"
        placeholderTextColor={theme.colors.textTertiary}
        style={styles.input}
      />
    </View>
  );
}

function saveDraft(sectionId: string, draft: { text: string; saved: string }) {
  if (draft.text.trimEnd() === draft.saved.trimEnd()) return;
  draft.saved = draft.text;
  void setSectionNotes(sectionId, draft.text);
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, padding: t.spacing.lg, paddingTop: t.spacing.xl, gap: t.spacing.md },
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
}));
