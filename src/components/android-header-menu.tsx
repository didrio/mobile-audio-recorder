/** iOS (and Jest): header menus are `Stack.Toolbar.Menu`s; see `android-header-menu.android.tsx`. */
import type { IconName } from '@/components/ui';

export type HeaderMenuItem = {
  label: string;
  onPress?: () => void;
  /** Shows a check (for a current choice). */
  selected?: boolean;
  disabled?: boolean;
};

export type AndroidHeaderMenuProps = { label: string; icon: IconName; items: HeaderMenuItem[] };

export function AndroidHeaderMenu(_props: AndroidHeaderMenuProps) {
  return null;
}
