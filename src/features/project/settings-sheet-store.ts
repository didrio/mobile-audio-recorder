import { create } from 'zustand';

export type SettingsSheetTab = 'idea' | 'recording';

/** The settings sheet's last tab (T44), remembered while the app runs (not saved). */
export const useSettingsSheetStore = create<{
  tab: SettingsSheetTab;
  setTab: (tab: SettingsSheetTab) => void;
}>((set) => ({
  tab: 'idea',
  setTab: (tab) => set({ tab }),
}));
