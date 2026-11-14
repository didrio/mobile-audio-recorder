/**
 * Tempo and time signature, as pure functions (no React, no storage).
 *
 * `bpm` counts beats per minute, where a beat is one `1/beatUnit` note: quarter notes in x/4, eighth notes
 * in x/8. So 6/8 at 120 BPM is six eighths in 3 s. Compound meters (6/8, 12/8) group their eighth-note
 * beats in threes; the grid draws a slightly stronger line at each group.
 */

export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const DEFAULT_BPM = 120;

export type Meter = { bpm: number; beatsPerBar: number; beatUnit: number };

export const TIME_SIGNATURES = [
  { beatsPerBar: 2, beatUnit: 4 },
  { beatsPerBar: 3, beatUnit: 4 },
  { beatsPerBar: 4, beatUnit: 4 },
  { beatsPerBar: 5, beatUnit: 4 },
  { beatsPerBar: 6, beatUnit: 8 },
  { beatsPerBar: 7, beatUnit: 8 },
  { beatsPerBar: 12, beatUnit: 8 },
] as const;

export function timeSignatureLabel(beatsPerBar: number, beatUnit: number): string {
  return `${beatsPerBar}/${beatUnit}`;
}

/** A bpm within the allowed range, whole number. */
export function clampBpm(bpm: number): number {
  'worklet';
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

/** Compound meter: eighth-note beats grouped in threes (6/8, 12/8). */
export function isCompound(beatsPerBar: number, beatUnit: number): boolean {
  'worklet';
  return beatUnit === 8 && beatsPerBar % 3 === 0;
}

export function beatSeconds(meter: Meter): number {
  'worklet';
  return 60 / meter.bpm;
}

export function barSeconds(meter: Meter): number {
  'worklet';
  return (60 / meter.bpm) * meter.beatsPerBar;
}

/** Pre-roll length in seconds: whole bars with the grid on, a fixed time without it. */
export function preRollLength(
  options: { grid: boolean; meter: Meter },
  settings: { seconds: number; bars: number },
): number {
  return options.grid ? settings.bars * barSeconds(options.meter) : settings.seconds;
}

/** Taps further apart than this start a new tap-tempo measurement (milliseconds). */
export const TAP_RESET_MS = 2000;
const TAP_KEEP = 8;

/** The tap times after a tap at `now`: a long pause starts over, and only the last few are kept. */
export function addTap(taps: readonly number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const fresh = last === undefined || now - last > TAP_RESET_MS ? [] : [...taps];
  fresh.push(now);
  return fresh.slice(-TAP_KEEP);
}

/** BPM from the average gap between taps; `null` until there are two taps. */
export function bpmFromTaps(taps: readonly number[]): number | null {
  if (taps.length < 2) return null;
  const first = taps[0] as number;
  const last = taps[taps.length - 1] as number;
  const gap = (last - first) / (taps.length - 1);
  if (gap <= 0) return null;
  return clampBpm(60000 / gap);
}
