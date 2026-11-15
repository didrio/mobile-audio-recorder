import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { HIGHEST_NOTE, LOWEST_NOTE, octaveStart } from '@/features/audio/pitch';
import { zustandStorage } from '@/lib/storage';

type KeyboardSettingsState = {
  /** Pitch reference keyboard volume (T20), linear (1 = full level). Settings → Pitch keyboard. */
  keyboardVolume: number;
  setKeyboardVolume: (value: number) => void;
  /** The C the keyboard starts at (MIDI note), kept where it was last left. */
  keyboardStart: number;
  setKeyboardStart: (value: number) => void;
};

export const useKeyboardSettingsStore = create<KeyboardSettingsState>()(
  persist(
    (set) => ({
      keyboardVolume: 1,
      setKeyboardVolume: (value) =>
        set({ keyboardVolume: Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1 }),
      keyboardStart: 60,
      setKeyboardStart: (value) =>
        set({
          keyboardStart: octaveStart(
            Math.min(octaveStart(HIGHEST_NOTE) - 12, Math.max(LOWEST_NOTE, Math.round(value))),
          ),
        }),
    }),
    {
      name: 'settings.keyboard',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        keyboardVolume: state.keyboardVolume,
        keyboardStart: state.keyboardStart,
      }),
    },
  ),
);
