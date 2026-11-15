import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The local native module in `modules/echo-canceller` (iOS and Android, one shared C core): removes the
 * known backing from a take recorded from the speaker, always at its strongest settings. See
 * `modules/echo-canceller/cpp/echo_cancel.h`. Switched on in Settings → Experimental → Speaker mode.
 */

export type EchoPlan = {
  /** Windows of take files (absolute plain paths) as they played, placed in the recorded file. */
  clips: { path: string; gain: number; fileStart: number; offset: number; duration: number }[];
  /** Metronome clicks: `wave` indexes `waves`. */
  clicks: { fileStart: number; wave: number }[];
  /** Click sounds at the take's sample rate, scaled by the metronome volume. */
  waves: number[][];
};

export type CleanTakeResult = {
  /** Echo delay found, relative to the planned alignment. */
  delayMs: number;
  delayConfidence: number;
  /** Energy removed where the backing played. */
  reductionDb: number;
  seconds: number;
};

type EchoCancellerModule = {
  cleanTake(request: EchoPlan & { micPath: string; outputPath: string }): Promise<CleanTakeResult>;
};

const native = requireOptionalNativeModule<EchoCancellerModule>('EchoCanceller');

/** False where the native module isn't built (Expo Go): Speaker mode isn't offered there. */
export const isEchoCancellerAvailable = native != null;

/**
 * Writes a copy of the take at `micPath` (plain path) to `outputPath` with `plan` removed. Runs
 * natively, off the JS thread; rejects with a readable message.
 */
export function cleanTake(options: {
  micPath: string;
  outputPath: string;
  plan: EchoPlan;
}): Promise<CleanTakeResult> {
  if (!native) return Promise.reject(new Error('Speaker mode is not available on this device.'));
  return native.cleanTake({
    micPath: options.micPath,
    outputPath: options.outputPath,
    ...options.plan,
  });
}
