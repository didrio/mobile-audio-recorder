import type { IconName } from '@/components/ui';

/**
 * The idea's "⋯" header menu: Idea settings (T9), Notes (T24), Export… (T36), Duplicate and Delete
 * (T10), Favorite (T19; shown as "Unfavorite" with a filled star once starred, in `project-screen.tsx`).
 */
export type IdeaMenuItemId = 'settings' | 'notes' | 'export' | 'duplicate' | 'favorite' | 'delete';

export const IDEA_MENU_ITEMS: {
  id: IdeaMenuItemId;
  label: string;
  icon: IconName;
  destructive?: boolean;
}[] = [
  { id: 'settings', label: 'Idea settings', icon: { ios: 'slider.horizontal.3', android: 'tune' } },
  { id: 'notes', label: 'Notes', icon: { ios: 'note.text', android: 'notes' } },
  { id: 'export', label: 'Export…', icon: { ios: 'square.and.arrow.up', android: 'ios_share' } },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: { ios: 'plus.square.on.square', android: 'content_copy' },
  },
  { id: 'favorite', label: 'Favorite', icon: { ios: 'star', android: 'star' } },
  { id: 'delete', label: 'Delete', icon: { ios: 'trash', android: 'delete' }, destructive: true },
];
