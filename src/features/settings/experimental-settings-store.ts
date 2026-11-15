import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

type ExperimentalSettingsState = {
  /** The idea editor turned on its side (T43): time runs down, tracks are columns. Settings → Experimental. */
  verticalTimeline: boolean;
  setVerticalTimeline: (value: boolean) => void;
};

/** Features being tried out, off by default. */
export const useExperimentalSettingsStore = create<ExperimentalSettingsState>()(
  persist(
    (set) => ({
      verticalTimeline: false,
      setVerticalTimeline: (value) => set({ verticalTimeline: value }),
    }),
    {
      name: 'settings.experimental',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ verticalTimeline: state.verticalTimeline }),
    },
  ),
);
