import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

export const LATENCY_OFFSET_MIN_MS = -200;
export const LATENCY_OFFSET_MAX_MS = 500;
export const LATENCY_OFFSET_STEP_MS = 5;

type RecordingSettingsState = {
  /**
   * Extra latency compensation for overdubs, in milliseconds, on top of what the platform reports.
   * Positive moves new takes earlier (use it when overdubs sound late).
   */
  latencyOffsetMs: number;
  setLatencyOffsetMs: (value: number) => void;
};

export const useRecordingSettingsStore = create<RecordingSettingsState>()(
  persist(
    (set) => ({
      latencyOffsetMs: 0,
      setLatencyOffsetMs: (value) =>
        set({
          latencyOffsetMs: Math.min(
            LATENCY_OFFSET_MAX_MS,
            Math.max(LATENCY_OFFSET_MIN_MS, Math.round(value)),
          ),
        }),
    }),
    {
      name: 'settings.recording',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ latencyOffsetMs: state.latencyOffsetMs }),
    },
  ),
);
