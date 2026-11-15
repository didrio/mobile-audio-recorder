import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

type ExperimentalSettingsState = {
  /** The idea editor turned on its side (T43): time runs down, tracks are columns. Settings → Experimental. */
  verticalTimeline: boolean;
  setVerticalTimeline: (value: boolean) => void;
  /**
   * Speaker mode (T47): takes recorded without headphones get the backing (other tracks and the click,
   * heard from the speaker) removed after Stop, by echo cancellation against the known mix
   * (`@/lib/echo-canceller`). The raw take is kept next to the cleaned one.
   */
  speakerMode: boolean;
  setSpeakerMode: (value: boolean) => void;
};

/** Features being tried out, off by default. */
export const useExperimentalSettingsStore = create<ExperimentalSettingsState>()(
  persist(
    (set) => ({
      verticalTimeline: false,
      setVerticalTimeline: (value) => set({ verticalTimeline: value }),
      speakerMode: false,
      setSpeakerMode: (value) => set({ speakerMode: value }),
    }),
    {
      name: 'settings.experimental',
      // New keys get their defaults from the shallow merge, so adding settings needs no migration.
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        verticalTimeline: state.verticalTimeline,
        speakerMode: state.speakerMode,
      }),
    },
  ),
);
