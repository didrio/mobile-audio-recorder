import { create } from 'zustand';

/**
 * Hides the iOS tab bar while the Ideas list is in select mode (T37), like Photos and Files: the
 * select-mode toolbar (Export, Move, Delete) needs the full width, and the floating tab bar would
 * cover its middle. Read by `src/app/(tabs)/_layout.tsx`.
 */
export const useTabBarStore = create<{ hidden: boolean }>()(() => ({ hidden: false }));

export function setTabBarHidden(hidden: boolean) {
  useTabBarStore.setState({ hidden });
}
