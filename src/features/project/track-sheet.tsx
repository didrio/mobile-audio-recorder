import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useDeleteTrack, useProject, useRenameTrack } from '@/features/projects/queries';
import { makeStyles, useTheme } from '@/theme';

/**
 * Track settings, shown as a sheet over the project: rename and delete. An idea always keeps at
 * least one track, so the only track can't be deleted.
 */
export function TrackSheet() {
  const params = useLocalSearchParams<{ id: string; projectId: string }>();
  const project = useProject(params.projectId);
  const track = project.data?.tracks.find((candidate) => candidate.id === params.id);

  return track && project.data ? (
    <TrackForm
      key={track.id}
      projectId={project.data.id}
      track={track}
      canDelete={project.data.tracks.length > 1}
    />
  ) : null;
}

function TrackForm({
  projectId,
  track,
  canDelete,
}: {
  projectId: string;
  track: { id: string; name: string; clips: unknown[] };
  canDelete: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const router = useRouter();
  const rename = useRenameTrack();
  const remove = useDeleteTrack();
  const [name, setName] = useState(track.name);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (name.trim() && name.trim() !== track.name) {
      rename.mutate({ projectId, trackId: track.id, name });
    }
  };

  const deleteTrack = async () => {
    try {
      await remove.mutateAsync({ projectId, trackId: track.id });
      router.back();
    } catch {
      setError('The track could not be deleted.');
    }
  };

  const confirmDelete = () => {
    if (track.clips.length === 0) {
      void deleteTrack();
      return;
    }
    Alert.alert(`Delete ${track.name}?`, 'Its clips are removed from the idea.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteTrack() },
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
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      ) : (
        <Text variant="footnote" color="textSecondary">
          An idea needs at least one track.
        </Text>
      )}
      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}
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
