import { AndroidHeaderMenu } from '@/components/android-header-menu';

import type { IdeaTitleMenuProps } from './idea-title-menu';

/** Android: the title with a drop-down arrow opening a Material dropdown (see `idea-title-menu.tsx`). */
export function IdeaTitleMenu({ title, items }: IdeaTitleMenuProps) {
  return (
    <AndroidHeaderMenu
      label={`${title}, idea actions`}
      title={title}
      items={items.map((item) => ({
        label: item.label,
        disabled: item.disabled,
        onPress: item.onPress,
      }))}
    />
  );
}
