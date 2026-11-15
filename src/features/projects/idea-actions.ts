import { Alert } from 'react-native';

import type { ActionMenuItem } from '@/components/action-menu';
import type { IconName } from '@/components/ui';

export type IdeaAction =
  'favorite' | 'rename' | 'export' | 'duplicate' | 'move' | 'select' | 'delete';
export type FolderAction = 'rename' | 'move' | 'select' | 'delete';

export type RowAction<A extends string> = {
  action: A;
  label: string;
  icon: IconName;
  tone: 'neutral' | 'primary' | 'danger';
};

const RENAME = {
  action: 'rename',
  label: 'Rename',
  icon: { ios: 'pencil', android: 'edit' },
  tone: 'neutral',
} as const;
const DELETE = {
  action: 'delete',
  label: 'Delete',
  icon: { ios: 'trash', android: 'delete' },
  tone: 'danger',
} as const;

/** An idea row's trailing swipe actions (swiping the other way stars it). */
export const ROW_ACTIONS: RowAction<IdeaAction>[] = [
  {
    action: 'export',
    label: 'Export',
    icon: { ios: 'square.and.arrow.up', android: 'ios_share' },
    tone: 'primary',
  },
  RENAME,
  {
    action: 'duplicate',
    label: 'Duplicate',
    icon: { ios: 'plus.square.on.square', android: 'content_copy' },
    tone: 'neutral',
  },
  DELETE,
];

/** A folder row's swipe actions. */
export const FOLDER_ROW_ACTIONS: RowAction<FolderAction>[] = [RENAME, DELETE];

/** An idea's long-press menu. */
export function ideaMenuItems(
  favorite: boolean,
  onSelect: (action: IdeaAction) => void,
): ActionMenuItem[] {
  return [
    { label: favorite ? 'Unfavorite' : 'Favorite', onPress: () => onSelect('favorite') },
    { label: 'Rename', onPress: () => onSelect('rename') },
    { label: 'Export…', onPress: () => onSelect('export') },
    { label: 'Duplicate', onPress: () => onSelect('duplicate') },
    { label: 'Move to…', onPress: () => onSelect('move') },
    { label: 'Select', onPress: () => onSelect('select') },
    { label: 'Delete', destructive: true, onPress: () => onSelect('delete') },
  ];
}

/** A folder's long-press menu. */
export function folderMenuItems(onSelect: (action: FolderAction) => void): ActionMenuItem[] {
  return [
    { label: 'Rename', onPress: () => onSelect('rename') },
    { label: 'Move to…', onPress: () => onSelect('move') },
    { label: 'Select', onPress: () => onSelect('select') },
    { label: 'Delete', destructive: true, onPress: () => onSelect('delete') },
  ];
}

/** Asks before deleting (wording from `deleteMessage` in `folder-tree.ts`). */
export function confirmDelete(
  { title, message }: { title: string; message: string },
  onConfirm: () => void,
) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

/** Asks before moving an idea to Recently Deleted (the idea's "⋯" menu). */
export function confirmDeleteIdea(name: string, onConfirm: () => void) {
  confirmDelete(
    {
      title: `Delete “${name}”?`,
      message: 'The idea moves to Recently Deleted. It stays there for 30 days.',
    },
    onConfirm,
  );
}
