import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon, ListRow, ListSection, Screen, Text } from '@/components/ui';
import { formatDuration } from '@/features/audio/format-time';
import { makeStyles } from '@/theme';

import { useCreateProject, useProjects } from './queries';

/** The Ideas tab: one big button to capture a new idea, and the list of saved ideas. */
export function ProjectsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const projects = useProjects();
  const createProject = useCreateProject();

  const recordNewIdea = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const project = await createProject.mutateAsync(undefined);
    router.push({ pathname: '/project/[id]', params: { id: project.id, record: '1' } });
  };

  const openProject = (id: string) => router.push({ pathname: '/project/[id]', params: { id } });

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record new idea"
        accessibilityState={{ busy: createProject.isPending }}
        disabled={createProject.isPending}
        onPress={recordNewIdea}
        style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
        <View style={styles.recordButton}>
          <Icon name={{ ios: 'mic.fill', android: 'mic' }} size={36} color="onPrimary" />
        </View>
        <Text variant="headline">Record new idea</Text>
      </Pressable>

      {projects.isError ? (
        <Text color="danger" align="center">
          Couldn&apos;t load your ideas.
        </Text>
      ) : projects.data && projects.data.length > 0 ? (
        <ListSection title="Ideas">
          {projects.data.map((project) => (
            <ListRow
              key={project.id}
              title={project.name}
              value={formatDuration(project.duration)}
              onPress={() => openProject(project.id)}
            />
          ))}
        </ListSection>
      ) : projects.data ? (
        <Text color="textSecondary" align="center">
          Your ideas show up here. Tap the button to start recording.
        </Text>
      ) : null}
    </Screen>
  );
}

const RECORD_BUTTON_SIZE = 88;

const useStyles = makeStyles((t) => ({
  hero: {
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.xl,
  },
  pressed: { opacity: 0.7 },
  recordButton: {
    width: RECORD_BUTTON_SIZE,
    height: RECORD_BUTTON_SIZE,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
