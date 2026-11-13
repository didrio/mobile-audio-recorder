import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

import { deleteTrackEdit, renameTrackEdit } from './edit-commands';
import { executeEdit, useEditorStore } from './editor-store';

/**
 * Track settings, shown as a sheet over the open idea (editor store): rename and delete, both
 * undoable from the idea's header. An idea always keeps at least one track, so the only track can't
 * be deleted.
 */
export function TrackSheet() {
  const params = useLocalSearchParams<{ id: string; projectId: string }>();
  const project = useEditorStore((state) =>
    state.projectId === params.projectId ? state.project : null,
  );
  const track = project?.tracks.find((candidate) => candidate.id === params.id);

  return track && project ? (
    <TrackForm key={track.id} track={track} canDelete={project.tracks.length > 1} />
  ) : null;
}

function TrackForm({
  track,
  canDelete,
}: {
  track: { id: string; name: string; clips: unknown[] };
  canDelete: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const router = useRouter();
  const [name, setName] = useState(track.name);

  const currentProject = () => useEditorStore.getState().project;

  const save = () => {
    const project = currentProject();
    if (project) void executeEdit(renameTrackEdit(project, track.id, name));
  };

  const deleteTrack = () => {
    const project = currentProject();
    if (project) void executeEdit(deleteTrackEdit(project, track.id));
    router.back();
  };

  const confirmDelete = () => {
    if (track.clips.length === 0) {
      deleteTrack();
      return;
    }
    Alert.alert(`Delete ${track.name}?`, 'Its clips are removed from the idea.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteTrack },
    ]);
  };

  return (
    <View style={styles.root}>
      <Text variant="headline" accessibilityRole="header" align="center">
        {track.name}
      </Text>
      <Text variant="footnote" color="textSecondary">
        Name
      </Text>
      <TextInput
        accessibilityLabel="Track name"
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        onBlur={save}
        returnKeyType="done"
        autoCapitalize="words"
        maxLength={40}
        selectTextOnFocus
        placeholderTextColor={theme.colors.textTertiary}
        style={styles.input}
      />
      {canDelete ? (
        <Button
          title="Delete track"
          variant="destructive"
          icon={{ ios: 'trash', android: 'delete' }}
          onPress={confirmDelete}
        />
      ) : (
        <Text variant="footnote" color="textSecondary">
          An idea needs at least one track.
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { padding: t.spacing.lg, paddingTop: t.spacing.xl, gap: t.spacing.md },
  input: {
    ...t.typography.body,
    color: t.colors.text,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
}));
