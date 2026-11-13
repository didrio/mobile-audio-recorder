import type { IconName } from '@/components/ui';

/**
 * The idea's "⋯" header menu. Placeholders for now (shown disabled): Idea settings comes with T9,
 * Duplicate and Delete with T10, Favorite with T19.
 */
export const IDEA_MENU_ITEMS: { label: string; icon: IconName; destructive?: boolean }[] = [
  { label: 'Idea settings', icon: { ios: 'slider.horizontal.3', android: 'tune' } },
  { label: 'Duplicate', icon: { ios: 'plus.square.on.square', android: 'content_copy' } },
  { label: 'Favorite', icon: { ios: 'star', android: 'star' } },
  { label: 'Delete', icon: { ios: 'trash', android: 'delete' }, destructive: true },
];
