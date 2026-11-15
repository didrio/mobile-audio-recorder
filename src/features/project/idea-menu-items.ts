import type { IconName } from '@/components/ui';

/**
 * The idea's title menu (T44: tap the idea's name in the header): Rename, Favorite (T19; shown as
 * "Unfavorite" with a filled star once starred, in `project-screen.tsx`), Duplicate (T10), Move to…,
 * Export… (T36) and Delete (T10). Settings and Notes have their own buttons (header, status strip).
 */
export type IdeaMenuItemId = 'rename' | 'favorite' | 'duplicate' | 'move' | 'export' | 'delete';

export const IDEA_MENU_ITEMS: {
  id: IdeaMenuItemId;
  label: string;
  icon: IconName;
  destructive?: boolean;
}[] = [
  { id: 'rename', label: 'Rename', icon: { ios: 'pencil', android: 'edit' } },
  { id: 'favorite', label: 'Favorite', icon: { ios: 'star', android: 'star' } },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: { ios: 'plus.square.on.square', android: 'content_copy' },
  },
  { id: 'move', label: 'Move to…', icon: { ios: 'folder', android: 'drive_file_move' } },
  { id: 'export', label: 'Export…', icon: { ios: 'square.and.arrow.up', android: 'ios_share' } },
  { id: 'delete', label: 'Delete', icon: { ios: 'trash', android: 'delete' }, destructive: true },
];
