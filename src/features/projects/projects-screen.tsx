import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AndroidHeaderMenu, type HeaderMenuItem } from '@/components/android-header-menu';
import { Icon, ListSection, Screen, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import { confirmDeleteIdea, showIdeaMenu, type IdeaAction } from './idea-actions';
import { IdeaRow } from './idea-row';
import { filterIdeas, SORT_ORDERS, sortIdeas } from './ideas-list';
import { useIdeasSortStore } from './ideas-sort-store';
import {
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
  useProjects,
  useRenameProject,
} from './queries';
import { RenameIdeaDialog } from './rename-idea-dialog';

/**
 * The Ideas tab: one big button to capture a new idea, the "+" menu (New Idea without recording), sort
 * and search in the header, and the list of saved ideas with rename / duplicate / delete.
 */
export function ProjectsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const projects = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const duplicateProject = useDuplicateProject();
  const renameProject = useRenameProject();
  const order = useIdeasSortStore((state) => state.order);
  const setOrder = useIdeasSortStore((state) => state.setOrder);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const recordNewIdea = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const project = await createProject.mutateAsync(undefined);
    router.push({ pathname: '/project/[id]', params: { id: project.id, record: '1' } });
  };

  const newIdea = async () => {
    const project = await createProject.mutateAsync(undefined);
    router.push({ pathname: '/project/[id]', params: { id: project.id } });
  };

  const openProject = (id: string) => router.push({ pathname: '/project/[id]', params: { id } });

  const runAction = (action: IdeaAction, id: string, name: string) => {
    if (action === 'rename') setRenaming({ id, name });
    else if (action === 'duplicate') duplicateProject.mutate(id);
    else confirmDeleteIdea(name, () => deleteProject.mutate(id));
  };

  const sortItems: HeaderMenuItem[] = SORT_ORDERS.map((option) => ({
    label: option.label,
    selected: option.value === order,
    onPress: () => setOrder(option.value),
  }));
  const addItems: HeaderMenuItem[] = [{ label: 'New Idea', onPress: () => void newIdea() }];

  const all = projects.data;
  const visible = all ? sortIdeas(filterIdeas(all, query), order) : [];

  return (
    <Screen>
      <Stack.Screen
        options={{
          ...(Platform.OS === 'android' && {
            headerRight: () => (
              <View style={styles.headerButtons}>
                <AndroidHeaderMenu
                  label="Sort"
                  icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }}
                  items={sortItems}
                />
                <AndroidHeaderMenu
                  label="Add"
                  icon={{ ios: 'plus', android: 'add' }}
                  items={addItems}
                />
              </View>
            ),
          }),
        }}
      />
      <Stack.SearchBar
        placeholder="Search ideas"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery('')}
      />
      {Platform.OS === 'ios' && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="arrow.up.arrow.down" accessibilityLabel="Sort">
            {sortItems.map((item) => (
              <Stack.Toolbar.MenuAction
                key={item.label}
                isOn={item.selected}
                onPress={item.onPress}>
                {item.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu icon="plus" accessibilityLabel="Add">
            <Stack.Toolbar.MenuAction icon="plus" onPress={() => void newIdea()}>
              New Idea
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}

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
      ) : all && all.length === 0 ? (
        <Text color="textSecondary" align="center">
          Your ideas show up here. Tap the button to start recording.
        </Text>
      ) : all && visible.length === 0 ? (
        <Text color="textSecondary" align="center">
          No ideas match “{query.trim()}”.
        </Text>
      ) : all ? (
        <ListSection title="Ideas">
          {visible.map((project) => (
            <IdeaRow
              key={project.id}
              idea={project}
              dateKind={order === 'created' ? 'created' : 'updated'}
              onOpen={() => openProject(project.id)}
              onAction={(action) => runAction(action, project.id, project.name)}
              onLongPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                showIdeaMenu(project.name, (action) => runAction(action, project.id, project.name));
              }}
            />
          ))}
        </ListSection>
      ) : null}

      <RenameIdeaDialog
        idea={renaming}
        onCancel={() => setRenaming(null)}
        onSubmit={(id, name) => {
          setRenaming(null);
          renameProject.mutate({ id, name });
        }}
      />
    </Screen>
  );
}

const RECORD_BUTTON_SIZE = 88;

const useStyles = makeStyles((t) => ({
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
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
