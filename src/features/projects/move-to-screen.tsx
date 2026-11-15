import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { makeStyles } from '@/theme';

import { countLabel, pickerRows } from './folder-tree';
import { useFolders, useMoveItems } from './queries';

const splitIds = (value: string | undefined) => (value ? value.split(',').filter(Boolean) : []);

/**
 * The "Move to…" sheet (`/move-to?ideas=…&folders=…`, comma-separated IDs): the Ideas root and every
 * folder as an indented tree. A folder can't go into itself or below itself, so those rows are disabled.
 */
export function MoveToScreen() {
  const styles = useStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ ideas?: string; folders?: string }>();
  const ideaIds = splitIds(params.ideas);
  const folderIds = splitIds(params.folders);
  const folders = useFolders();
  const moveItems = useMoveItems();
  const total = ideaIds.length + folderIds.length;

  const moveTo = (targetId: string | null) => {
    moveItems.mutate(
      { selection: { ideaIds, folderIds }, targetId },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Move to' }} />
      <Text variant="headline" style={styles.title}>
        Move {total === 1 ? 'to' : `${countLabel(total, 'item')} to`}
      </Text>
      <View style={styles.list}>
        {(folders.data ? pickerRows(folders.data, folderIds) : []).map((row) => (
          <Pressable
            key={row.id ?? 'root'}
            accessibilityRole="button"
            accessibilityLabel={row.name}
            accessibilityState={{ disabled: row.disabled || moveItems.isPending }}
            disabled={row.disabled || moveItems.isPending}
            onPress={() => moveTo(row.id)}
            style={({ pressed }) => [
              styles.row,
              { paddingLeft: styles.row.paddingHorizontal + row.depth * INDENT },
              row.disabled && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Icon
              name={
                row.id === null
                  ? { ios: 'tray.full', android: 'inbox' }
                  : { ios: 'folder', android: 'folder' }
              }
              size={20}
              color="primary"
            />
            <Text numberOfLines={1} style={styles.name}>
              {row.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {moveItems.isError ? (
        <Text color="danger" align="center">
          Couldn&apos;t move: {moveItems.error.message}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Indentation per folder level. */
const INDENT = 20;

const useStyles = makeStyles((t) => ({
  content: { padding: t.spacing.lg, gap: t.spacing.md },
  title: { paddingHorizontal: t.spacing.xs, paddingTop: t.spacing.md },
  list: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    minHeight: 48,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
  },
  name: { flexShrink: 1 },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: t.colors.surfacePressed },
}));
