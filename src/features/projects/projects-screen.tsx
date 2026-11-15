import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useActionMenu } from '@/components/action-menu';
import { AndroidHeaderMenu, type HeaderMenuItem } from '@/components/android-header-menu';
import { RenameDialog } from '@/components/rename-dialog';
import { Icon, ListRow, ListSection, Screen, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import { FolderRow } from './folder-row';
import {
  deleteMessage,
  formatFolderPath,
  itemCount,
  scopeContents,
  type IdeasScope,
  type ItemSelection,
} from './folder-tree';
import type { Folder } from './folders-repo';
import {
  confirmDelete,
  folderMenuItems,
  ideaMenuItems,
  type FolderAction,
  type IdeaAction,
} from './idea-actions';
import { IdeaRow } from './idea-row';
import { notesMatch, SORT_ORDERS } from './ideas-list';
import { useIdeasSortStore } from './ideas-sort-store';
import type { ProjectSummary } from './projects-repo';
import {
  useCreateFolder,
  useCreateProject,
  useDeleteItems,
  useDuplicateProject,
  useFolders,
  useProjects,
  useRenameFolder,
  useRenameProject,
  useSetFavorite,
} from './queries';
import { SelectionBar, type SelectionAction } from './selection-bar';
import { useSelection } from './use-selection';

/** The Ideas tab's root. */
export function ProjectsScreen() {
  return <IdeasListScreen scope={{ kind: 'root' }} />;
}

/** One folder's contents (`/folder/[id]`). */
export function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IdeasListScreen scope={{ kind: 'folder', id }} />;
}

/** Every starred idea, wherever it lives (`/favorites`). */
export function FavoritesScreen() {
  return <IdeasListScreen scope={{ kind: 'favorites' }} />;
}

type Renaming =
  | { kind: 'idea' | 'folder'; id: string; name: string }
  | { kind: 'new-folder'; id: string; name: string };

/**
 * The Ideas list (T10, T19): one big button to capture a new idea, the "+" menu (New Idea, New Folder),
 * Select, sort and search in the header, then (at the root) Favorites, folders and ideas, each with
 * swipe actions and a long-press menu. The root, a folder and Favorites are all this screen.
 */
export function IdeasListScreen({ scope }: { scope: IdeasScope }) {
  const styles = useStyles();
  const router = useRouter();
  const projects = useProjects();
  const foldersQuery = useFolders();
  const createProject = useCreateProject();
  const duplicateProject = useDuplicateProject();
  const renameProject = useRenameProject();
  const setFavorite = useSetFavorite();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteItems = useDeleteItems();
  const order = useIdeasSortStore((state) => state.order);
  const setOrder = useIdeasSortStore((state) => state.setOrder);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const selection = useSelection();
  const menu = useActionMenu();

  const folderId = scope.kind === 'folder' ? scope.id : null;
  const allIdeas = projects.data;
  const allFolders = foldersQuery.data;
  const loaded = allIdeas && allFolders;
  const folder = folderId ? allFolders?.find((candidate) => candidate.id === folderId) : undefined;
  const folderGone = scope.kind === 'folder' && !!allFolders && !folder;
  const canAdd = scope.kind !== 'favorites' && !folderGone;
  const searching = query.trim().length > 0;
  const contents = loaded
    ? scopeContents(scope, allFolders, allIdeas, query, order)
    : { folders: [], ideas: [] };
  const showPaths = searching || scope.kind === 'favorites';
  const favoriteCount = allIdeas?.filter((idea) => idea.favorite).length ?? 0;
  // Pinned at the top of the root, once there's anything to organize.
  const showFavoritesRow =
    scope.kind === 'root' &&
    !searching &&
    !selection.selecting &&
    (!!allIdeas?.length || !!allFolders?.length);

  const title =
    scope.kind === 'root'
      ? 'Ideas'
      : scope.kind === 'favorites'
        ? 'Favorites'
        : (folder?.name ?? '');

  const recordNewIdea = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Quick capture: no grid until the idea asks for one.
    const project = await createProject.mutateAsync({ grid: false, folderId });
    router.push({ pathname: '/project/[id]', params: { id: project.id, record: '1' } });
  };

  const newIdea = async () => {
    // A blank idea made on purpose starts with the grid on.
    const project = await createProject.mutateAsync({ grid: true, folderId });
    router.push({ pathname: '/project/[id]', params: { id: project.id } });
  };

  const newFolder = () => setRenaming({ kind: 'new-folder', id: 'new', name: '' });

  const openMove = (items: ItemSelection) =>
    router.push({
      pathname: '/move-to',
      params: { ideas: items.ideaIds.join(','), folders: items.folderIds.join(',') },
    });

  const askDelete = (items: ItemSelection, then?: () => void) => {
    if (!loaded) return;
    confirmDelete(deleteMessage(allFolders, allIdeas, items), () => {
      deleteItems.mutate(items);
      then?.();
    });
  };

  const runIdeaAction = (action: IdeaAction, idea: ProjectSummary) => {
    const items = { ideaIds: [idea.id], folderIds: [] };
    if (action === 'favorite') setFavorite.mutate({ ids: [idea.id], favorite: !idea.favorite });
    else if (action === 'rename') setRenaming({ kind: 'idea', id: idea.id, name: idea.name });
    else if (action === 'duplicate') duplicateProject.mutate(idea.id);
    else if (action === 'move') openMove(items);
    else if (action === 'select') selection.start({ kind: 'idea', id: idea.id });
    else askDelete(items);
  };

  const runFolderAction = (action: FolderAction, target: Folder) => {
    const items = { ideaIds: [], folderIds: [target.id] };
    if (action === 'rename') setRenaming({ kind: 'folder', id: target.id, name: target.name });
    else if (action === 'move') openMove(items);
    else if (action === 'select') selection.start({ kind: 'folder', id: target.id });
    else askDelete(items);
  };

  const visibleSelection: ItemSelection = {
    ideaIds: contents.ideas.map((idea) => idea.id),
    folderIds: contents.folders.map((item) => item.id),
  };
  const allSelected =
    selection.count > 0 &&
    selection.count === visibleSelection.ideaIds.length + visibleSelection.folderIds.length;
  const toggleAll = () =>
    selection.setAll(allSelected ? { ideaIds: [], folderIds: [] } : visibleSelection);

  const selectionActions: SelectionAction[] = [
    {
      id: 'move',
      label: 'Move',
      icon: { ios: 'folder', android: 'drive_file_move' },
      disabled: selection.count === 0,
      onPress: () => {
        openMove(selection.selection);
        selection.done();
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: { ios: 'trash', android: 'delete' },
      destructive: true,
      disabled: selection.count === 0,
      onPress: () => askDelete(selection.selection, selection.done),
    },
  ];

  const sortItems: HeaderMenuItem[] = SORT_ORDERS.map((option) => ({
    label: option.label,
    selected: option.value === order,
    onPress: () => setOrder(option.value),
  }));
  const addItems: HeaderMenuItem[] = [
    { label: 'New Idea', onPress: () => void newIdea() },
    { label: 'New Folder', onPress: newFolder },
  ];
  const selectedTitle = selection.count === 0 ? 'Select Items' : `${selection.count} Selected`;

  const header = selection.selecting ? (
    <>
      <Stack.Screen
        options={{
          title: selectedTitle,
          ...(Platform.OS === 'android' && {
            headerLeft: () => (
              <HeaderTextButton
                label={allSelected ? 'Deselect All' : 'Select All'}
                onPress={toggleAll}
              />
            ),
            headerRight: () => <HeaderTextButton label="Done" onPress={selection.done} />,
          }),
        }}
      />
      {Platform.OS === 'ios' && (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button onPress={toggleAll}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button variant="done" onPress={selection.done}>
              Done
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      )}
    </>
  ) : (
    <>
      <Stack.Screen
        options={{
          title,
          ...(Platform.OS === 'android' && {
            headerRight: () => (
              <View style={styles.headerButtons}>
                <HeaderTextButton label="Select" onPress={() => selection.start()} />
                <AndroidHeaderMenu
                  label="Sort"
                  icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }}
                  items={sortItems}
                />
                {canAdd ? (
                  <AndroidHeaderMenu
                    label="Add"
                    icon={{ ios: 'plus', android: 'add' }}
                    items={addItems}
                  />
                ) : null}
              </View>
            ),
          }),
        }}
      />
      {Platform.OS === 'ios' && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="checkmark.circle"
            accessibilityLabel="Select"
            onPress={() => selection.start()}>
            Select
          </Stack.Toolbar.Button>
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
          {canAdd ? (
            <Stack.Toolbar.Menu icon="plus" accessibilityLabel="Add">
              <Stack.Toolbar.MenuAction icon="doc.badge.plus" onPress={() => void newIdea()}>
                New Idea
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="folder.badge.plus" onPress={newFolder}>
                New Folder
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          ) : null}
        </Stack.Toolbar>
      )}
    </>
  );

  const emptyText = folderGone
    ? 'This folder was deleted.'
    : searching
      ? `Nothing matches “${query.trim()}”.`
      : scope.kind === 'favorites'
        ? 'Star an idea to see it here: swipe right on it, or use its menu.'
        : scope.kind === 'folder'
          ? 'This folder is empty. Record an idea here, or move ideas in.'
          : 'Your ideas show up here. Tap the button to start recording.';
  const isEmpty = contents.folders.length === 0 && contents.ideas.length === 0 && !showFavoritesRow;

  return (
    <View style={styles.root}>
      <Screen>
        {header}
        <Stack.SearchBar
          placeholder={
            scope.kind === 'folder' && folder ? `Search in ${folder.name}` : `Search ${title}`
          }
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onCancelButtonPress={() => setQuery('')}
        />

        {canAdd && !selection.selecting ? (
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
        ) : null}

        {projects.isError || foldersQuery.isError ? (
          <Text color="danger" align="center">
            Couldn&apos;t load your ideas.
          </Text>
        ) : !loaded ? null : (
          <>
            {showFavoritesRow || contents.folders.length > 0 ? (
              <ListSection>
                {showFavoritesRow ? (
                  <ListRow
                    key="favorites"
                    title="Favorites"
                    icon={{ ios: 'star.fill', android: 'star' }}
                    iconColor="favorite"
                    value={String(favoriteCount)}
                    onPress={() => router.push('/favorites')}
                  />
                ) : null}
                {contents.folders.map((item) => (
                  <FolderRow
                    key={item.id}
                    name={item.name}
                    count={itemCount(allFolders, allIdeas, item.id)}
                    path={searching ? formatFolderPath(allFolders, item.parentId) : null}
                    selected={
                      selection.selecting ? selection.isSelected('folder', item.id) : undefined
                    }
                    onOpen={() =>
                      selection.selecting
                        ? selection.toggle('folder', item.id)
                        : router.push({ pathname: '/folder/[id]', params: { id: item.id } })
                    }
                    onAction={(action) => runFolderAction(action, item)}
                    onLongPress={() => {
                      if (selection.selecting) return;
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      menu.show(
                        item.name,
                        folderMenuItems((action) => runFolderAction(action, item)),
                      );
                    }}
                  />
                ))}
              </ListSection>
            ) : null}

            {contents.ideas.length > 0 ? (
              <ListSection title={scope.kind === 'root' && !searching ? 'Ideas' : undefined}>
                {contents.ideas.map((idea) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    dateKind={order === 'created' ? 'created' : 'updated'}
                    match={notesMatch(idea, query)}
                    path={showPaths ? formatFolderPath(allFolders, idea.folderId) : null}
                    selected={
                      selection.selecting ? selection.isSelected('idea', idea.id) : undefined
                    }
                    onOpen={() =>
                      selection.selecting
                        ? selection.toggle('idea', idea.id)
                        : router.push({ pathname: '/project/[id]', params: { id: idea.id } })
                    }
                    onAction={(action) => runIdeaAction(action, idea)}
                    onLongPress={() => {
                      if (selection.selecting) return;
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      menu.show(
                        idea.name,
                        ideaMenuItems(idea.favorite, (action) => runIdeaAction(action, idea)),
                      );
                    }}
                  />
                ))}
              </ListSection>
            ) : null}

            {isEmpty ? (
              <Text color="textSecondary" align="center">
                {emptyText}
              </Text>
            ) : null}
          </>
        )}
      </Screen>
      {selection.selecting ? <SelectionBar actions={selectionActions} /> : null}

      {menu.element}
      <RenameDialog
        item={renaming}
        title={
          renaming?.kind === 'new-folder'
            ? 'New folder'
            : renaming?.kind === 'folder'
              ? 'Rename folder'
              : 'Rename idea'
        }
        inputLabel={renaming?.kind === 'idea' ? 'Idea name' : 'Folder name'}
        submitLabel={renaming?.kind === 'new-folder' ? 'Create' : 'Save'}
        onCancel={() => setRenaming(null)}
        onSubmit={(id, name) => {
          const kind = renaming?.kind;
          setRenaming(null);
          if (kind === 'new-folder') createFolder.mutate({ parentId: folderId, name });
          else if (kind === 'folder') renameFolder.mutate({ id, name });
          else renameProject.mutate({ id, name });
        }}
      />
    </View>
  );
}

/** A text button in the Android header (iOS uses `Stack.Toolbar`). */
function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.headerTextButton, pressed && styles.pressed]}>
      <Text color="primary">{label}</Text>
    </Pressable>
  );
}

const RECORD_BUTTON_SIZE = 88;

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  headerTextButton: { paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.xs },
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
