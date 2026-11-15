import { Stack } from 'expo-router';
import { Alert, Platform, Pressable } from 'react-native';

import { useActionMenu } from '@/components/action-menu';
import { ListRow, ListSection, Screen, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import type { ItemSelection } from './folder-tree';
import { formatFolderPath } from './folder-tree';
import { useFolders, useDeleted, usePurgeItems, useRestoreItems } from './queries';
import { daysLeftLabel, deleteNowMessage, topLevelDeleted } from './recently-deleted';
import { SelectionBar, type SelectionAction } from './selection-bar';
import { useSelection } from './use-selection';

/**
 * Recently Deleted (T41): what was deleted in the last 30 days, with the days left. Tap an item for
 * Restore / Delete Now, or Select several.
 */
export function RecentlyDeletedScreen() {
  const styles = useStyles();
  const deleted = useDeleted();
  const active = useFolders();
  const restore = useRestoreItems();
  const purge = usePurgeItems();
  const selection = useSelection();
  const menu = useActionMenu();

  const loaded = deleted.data && active.data;
  const allFolders = loaded ? [...active.data, ...deleted.data.folders] : [];
  const rows = deleted.data ? topLevelDeleted(deleted.data.folders, deleted.data.ideas) : null;
  const total = rows ? rows.folders.length + rows.ideas.length : 0;

  const namesOf = (items: ItemSelection) => ({
    ideas: items.ideaIds.map((id) => rows?.ideas.find((idea) => idea.id === id)?.name ?? ''),
    folders: items.folderIds.map(
      (id) => rows?.folders.find((folder) => folder.id === id)?.name ?? '',
    ),
  });

  const askDeleteNow = (items: ItemSelection, then?: () => void) => {
    const { title, message } = deleteNowMessage(items, namesOf(items));
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          purge.mutate(items);
          then?.();
        },
      },
    ]);
  };

  const showMenu = (kind: 'idea' | 'folder', id: string, name: string) => {
    const items: ItemSelection =
      kind === 'idea' ? { ideaIds: [id], folderIds: [] } : { ideaIds: [], folderIds: [id] };
    menu.show(name, [
      { label: 'Restore', onPress: () => restore.mutate(items) },
      { label: 'Delete Now', destructive: true, onPress: () => askDeleteNow(items) },
    ]);
  };

  const allSelection: ItemSelection = {
    ideaIds: rows?.ideas.map((idea) => idea.id) ?? [],
    folderIds: rows?.folders.map((folder) => folder.id) ?? [],
  };
  const allSelected = selection.count > 0 && selection.count === total;
  const toggleAll = () =>
    selection.setAll(allSelected ? { ideaIds: [], folderIds: [] } : allSelection);

  const actions: SelectionAction[] = [
    {
      id: 'restore',
      label: 'Restore',
      icon: { ios: 'arrow.uturn.backward', android: 'restore_from_trash' },
      disabled: selection.count === 0,
      onPress: () => {
        restore.mutate(selection.selection);
        selection.done();
      },
    },
    {
      id: 'delete-now',
      label: 'Delete Now',
      icon: { ios: 'trash', android: 'delete_forever' },
      destructive: true,
      disabled: selection.count === 0,
      onPress: () => askDeleteNow(selection.selection, selection.done),
    },
  ];

  const header = selection.selecting ? (
    <>
      <Stack.Screen
        options={{
          title: selection.count === 0 ? 'Select Items' : `${selection.count} Selected`,
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
          title: 'Recently Deleted',
          ...(Platform.OS === 'android' &&
            total > 0 && {
              headerRight: () => (
                <HeaderTextButton label="Select" onPress={() => selection.start()} />
              ),
            }),
        }}
      />
      {Platform.OS === 'ios' && total > 0 && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="checkmark.circle"
            accessibilityLabel="Select"
            onPress={() => selection.start()}>
            Select
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      )}
    </>
  );

  const subtitle = (deletedAt: number, parentId: string | null) => {
    const path = parentId ? formatFolderPath(allFolders, parentId) : null;
    return path ? `${daysLeftLabel(deletedAt)} · in ${path}` : daysLeftLabel(deletedAt);
  };

  return (
    <>
      <Screen grouped>
        {header}
        {deleted.isError ? (
          <Text color="danger" align="center">
            Couldn&apos;t load Recently Deleted.
          </Text>
        ) : !rows || !loaded ? null : total === 0 ? (
          <Text color="textSecondary" align="center" style={styles.empty}>
            Nothing recently deleted. Deleted ideas and folders stay here for 30 days.
          </Text>
        ) : (
          <ListSection footer="Items are deleted for good after 30 days.">
            {rows.folders.map((folder) => (
              <ListRow
                key={`folder-${folder.id}`}
                title={folder.name}
                subtitle={subtitle(folder.deletedAt ?? 0, folder.parentId)}
                icon={{ ios: 'folder', android: 'folder' }}
                selected={
                  selection.selecting ? selection.isSelected('folder', folder.id) : undefined
                }
                onPress={() =>
                  selection.selecting
                    ? selection.toggle('folder', folder.id)
                    : showMenu('folder', folder.id, folder.name)
                }
              />
            ))}
            {rows.ideas.map((idea) => (
              <ListRow
                key={`idea-${idea.id}`}
                title={idea.name}
                subtitle={subtitle(idea.deletedAt ?? 0, idea.folderId)}
                icon={{ ios: 'waveform', android: 'graphic_eq' }}
                selected={selection.selecting ? selection.isSelected('idea', idea.id) : undefined}
                onPress={() =>
                  selection.selecting
                    ? selection.toggle('idea', idea.id)
                    : showMenu('idea', idea.id, idea.name)
                }
              />
            ))}
          </ListSection>
        )}
      </Screen>
      {selection.selecting ? <SelectionBar actions={actions} /> : null}
      {menu.element}
    </>
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

const useStyles = makeStyles((t) => ({
  empty: { paddingVertical: t.spacing.xl },
  headerTextButton: { paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.xs },
  pressed: { opacity: 0.7 },
}));
