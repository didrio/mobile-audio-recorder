import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

export const LATENCY_OFFSET_MIN_MS = -200;
export const LATENCY_OFFSET_MAX_MS = 500;
export const LATENCY_OFFSET_STEP_MS = 5;

/** Pre-roll lengths offered for ideas with the grid off. */
export const PRE_ROLL_SECONDS_OPTIONS = [1, 2, 4] as const;
export type PreRollSeconds = (typeof PRE_ROLL_SECONDS_OPTIONS)[number];
/** Pre-roll lengths for ideas with the grid on: whole bars, so the punch lands on a bar line. */
export const PRE_ROLL_BARS_OPTIONS = [1, 2] as const;
export type PreRollBars = (typeof PRE_ROLL_BARS_OPTIONS)[number];

type RecordingSettingsState = {
  /**
   * Extra latency compensation for overdubs, in milliseconds, on top of what the platform reports.
   * Positive moves new takes earlier (use it when overdubs sound late).
   */
  latencyOffsetMs: number;
  setLatencyOffsetMs: (value: number) => void;
  /** How long the run-up before a punch-in is, when pre-roll is on for the idea. */
  preRollSeconds: PreRollSeconds;
  setPreRollSeconds: (value: PreRollSeconds) => void;
  /** The same for ideas with the grid on, in bars of the idea's tempo and time signature. */
  preRollBars: PreRollBars;
  setPreRollBars: (value: PreRollBars) => void;
};

export const useRecordingSettingsStore = create<RecordingSettingsState>()(
  persist(
    (set) => ({
      latencyOffsetMs: 0,
      preRollSeconds: 2,
      setPreRollSeconds: (value) => set({ preRollSeconds: value }),
      preRollBars: 1,
      setPreRollBars: (value) => set({ preRollBars: value }),
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
      partialize: (state) => ({
        latencyOffsetMs: state.latencyOffsetMs,
        preRollSeconds: state.preRollSeconds,
        preRollBars: state.preRollBars,
      }),
    },
  ),
);
