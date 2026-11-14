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
/** `light`: echo cancellation only. `strong`: plus residual echo suppression (can dull the take). */
export type CleanupStrength = 'light' | 'strong';

function clampLatencyOffset(value: number): number {
  return Math.min(LATENCY_OFFSET_MAX_MS, Math.max(LATENCY_OFFSET_MIN_MS, Math.round(value)));
}

type RecordingSettingsState = {
  /**
   * Extra latency compensation for overdubs, in milliseconds, on top of what the platform reports.
   * Positive moves new takes earlier (use it when overdubs sound late).
   */
  latencyOffsetMs: number;
  setLatencyOffsetMs: (value: number) => void;
  /**
   * Speaker mode: takes recorded without headphones get the backing (other tracks and the click, heard
   * from the speaker) removed after Stop, by echo cancellation against the known mix. The raw take is
   * kept next to the cleaned one.
   */
  speakerMode: boolean;
  setSpeakerMode: (value: boolean) => void;
  /** Speaker mode: `strong` also turns down what's left of the backing per frequency (can dull a take). */
  cleanupStrength: CleanupStrength;
  setCleanupStrength: (value: CleanupStrength) => void;
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
      setLatencyOffsetMs: (value) => set({ latencyOffsetMs: clampLatencyOffset(value) }),
      speakerMode: false,
      setSpeakerMode: (value) => set({ speakerMode: value }),
      cleanupStrength: 'light',
      setCleanupStrength: (value) => set({ cleanupStrength: value }),
      preRollSeconds: 2,
      setPreRollSeconds: (value) => set({ preRollSeconds: value }),
      preRollBars: 1,
      setPreRollBars: (value) => set({ preRollBars: value }),
    }),
    {
      name: 'settings.recording',
      // New keys get their defaults from the shallow merge, so adding settings needs no migration.
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        latencyOffsetMs: state.latencyOffsetMs,
        speakerMode: state.speakerMode,
        cleanupStrength: state.cleanupStrength,
        preRollSeconds: state.preRollSeconds,
        preRollBars: state.preRollBars,
      }),
    },
  ),
);
