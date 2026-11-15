import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { OUTPUT_ROUTES, type OutputRoute } from '@/features/audio/audio-route';
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

/** Bit depth of recorded takes (WAV). 24-bit leaves headroom; 16-bit makes files a third smaller. */
export const RECORDING_BIT_DEPTHS = [16, 24] as const;
export type RecordingBitDepth = (typeof RECORDING_BIT_DEPTHS)[number];

export type LatencyOffsets = Record<OutputRoute, number>;

function clampLatencyOffset(value: number): number {
  return Math.min(LATENCY_OFFSET_MAX_MS, Math.max(LATENCY_OFFSET_MIN_MS, Math.round(value)));
}

const NO_OFFSETS: LatencyOffsets = { speaker: 0, wired: 0, bluetooth: 0, usb: 0 };

type RecordingSettingsState = {
  /**
   * Extra latency compensation for overdubs per output route (T38), in milliseconds, on top of what
   * the platform reports. Positive moves new takes earlier (use it when overdubs sound late).
   */
  latencyOffsetsMs: LatencyOffsets;
  setLatencyOffsetMs: (route: OutputRoute, value: number) => void;
  /**
   * The single offset from before T38, waiting for the first output route the app sees (it was tuned
   * on whatever the phone used then); `null` once claimed or when it was 0.
   */
  legacyLatencyOffsetMs: number | null;
  /** Gives the pre-T38 offset to `route`, once. */
  claimLegacyOffset: (route: OutputRoute) => void;
  /**
   * With Bluetooth headphones, record from the phone's mic so they stay in high-quality playback
   * (A2DP). Off: the headset's mic records, and playback drops to call quality (HFP).
   */
  bluetoothPhoneMic: boolean;
  setBluetoothPhoneMic: (value: boolean) => void;
  bitDepth: RecordingBitDepth;
  setBitDepth: (value: RecordingBitDepth) => void;
  /**
   * Silent recording (T34): without headphones, everything plays up to the punch, then the output
   * fades out just before it and the take is recorded in silence (nothing bleeds into it).
   */
  silentRecording: boolean;
  setSilentRecording: (value: boolean) => void;
  /** How long the run-up before a punch-in is, when pre-roll is on for the idea. */
  preRollSeconds: PreRollSeconds;
  setPreRollSeconds: (value: PreRollSeconds) => void;
  /** The same for ideas with the grid on, in bars of the idea's tempo and time signature. */
  preRollBars: PreRollBars;
  setPreRollBars: (value: PreRollBars) => void;
  /**
   * Hear yourself (T39): the input plays in the headphones while a track is armed. Only applies where
   * `monitorStatus` (`@/features/audio/monitoring`) allows it (never on the speaker).
   */
  monitoring: boolean;
  setMonitoring: (value: boolean) => void;
  /** How loud you hear yourself (linear gain, 1 = as it comes in; up to +6 dB like the faders). */
  monitorLevel: number;
  setMonitorLevel: (value: number) => void;
};

export const useRecordingSettingsStore = create<RecordingSettingsState>()(
  persist(
    (set) => ({
      latencyOffsetsMs: NO_OFFSETS,
      setLatencyOffsetMs: (route, value) =>
        set((state) => ({
          latencyOffsetsMs: { ...state.latencyOffsetsMs, [route]: clampLatencyOffset(value) },
        })),
      legacyLatencyOffsetMs: null,
      claimLegacyOffset: (route) =>
        set((state) =>
          state.legacyLatencyOffsetMs === null
            ? state
            : {
                latencyOffsetsMs: {
                  ...state.latencyOffsetsMs,
                  [route]: clampLatencyOffset(state.legacyLatencyOffsetMs),
                },
                legacyLatencyOffsetMs: null,
              },
        ),
      bluetoothPhoneMic: true,
      setBluetoothPhoneMic: (value) => set({ bluetoothPhoneMic: value }),
      bitDepth: 24,
      setBitDepth: (value) => set({ bitDepth: value }),
      silentRecording: false,
      setSilentRecording: (value) => set({ silentRecording: value }),
      preRollSeconds: 2,
      setPreRollSeconds: (value) => set({ preRollSeconds: value }),
      preRollBars: 1,
      setPreRollBars: (value) => set({ preRollBars: value }),
      monitoring: false,
      setMonitoring: (value) => set({ monitoring: value }),
      monitorLevel: 1,
      setMonitorLevel: (value) => set({ monitorLevel: Math.min(2, Math.max(0, value)) }),
    }),
    {
      name: 'settings.recording',
      // New keys get their defaults from the shallow merge, so adding settings needs no migration;
      // changing one does (`migrateRecordingSettings`).
      version: 3,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persisted, version) => migrateRecordingSettings(persisted, version) as never,
      partialize: (state) => ({
        latencyOffsetsMs: state.latencyOffsetsMs,
        legacyLatencyOffsetMs: state.legacyLatencyOffsetMs,
        bluetoothPhoneMic: state.bluetoothPhoneMic,
        bitDepth: state.bitDepth,
        silentRecording: state.silentRecording,
        preRollSeconds: state.preRollSeconds,
        preRollBars: state.preRollBars,
        monitoring: state.monitoring,
        monitorLevel: state.monitorLevel,
      }),
    },
  ),
);

/** The latency offset for takes recorded while playing to `route`. */
export function latencyOffsetFor(
  state: Pick<RecordingSettingsState, 'latencyOffsetsMs'>,
  route: OutputRoute,
): number {
  return state.latencyOffsetsMs[route] ?? 0;
}

/**
 * Persisted settings from an older version. v1 → v2 (T38): the single `latencyOffsetMs` became one
 * offset per output route; a non-zero old value waits in `legacyLatencyOffsetMs` for the first route
 * the app sees (the one it was most likely tuned on). v2 → v3 (T47): Speaker mode moved to the
 * experimental settings with one cleanup strength, so `speakerMode` and `cleanupStrength` are dropped.
 */
export function migrateRecordingSettings(persisted: unknown, version: number): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted;
  if (version >= 3) return persisted;
  let settings = persisted as Record<string, unknown>;
  if (version < 2) {
    const { latencyOffsetMs, ...rest } = settings;
    const legacy =
      typeof latencyOffsetMs === 'number' && latencyOffsetMs !== 0
        ? clampLatencyOffset(latencyOffsetMs)
        : null;
    settings = {
      ...rest,
      latencyOffsetsMs: Object.fromEntries(OUTPUT_ROUTES.map((route) => [route, 0])),
      legacyLatencyOffsetMs: legacy,
    };
  }
  const { speakerMode: _speakerMode, cleanupStrength: _cleanupStrength, ...rest } = settings;
  return rest;
}
