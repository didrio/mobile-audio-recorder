/**
 * The metronome's clicks, as pure functions (no React, no audio context): where they fall on the
 * timeline and what they sound like. The engine schedules them (`audio-engine.ts`).
 *
 * Clicks sit on the timeline's beat grid from 0:00 (`tempo.ts`), so they line up with the bar lines
 * and with takes. The grid continues before 0:00, which makes the pre-roll's run-up a count-in.
 * Accents: the first beat of a bar is the strongest; compound meters (6/8, 12/8) also accent the
 * start of each group of three eighths.
 *
 * The visual metronome (`beat-display.tsx`) reads the same grid on the UI thread with `beatAt`, so
 * what's lit is the click that's heard.
 */
import { beatSeconds, isCompound, type Meter } from './tempo';

/** Rounding slack in beats, so a position computed as 1.9999999 still counts as beat 2. */
const EPSILON = 1e-9;

/** How the metronome keeps time: clicks you hear, beats you see (`beat-display.tsx`), or both. */
export type MetronomeOutput = 'sound' | 'visual' | 'both';

export const METRONOME_OUTPUTS: readonly MetronomeOutput[] = ['sound', 'visual', 'both'];

export function isMetronomeOutput(value: unknown): value is MetronomeOutput {
  return value === 'sound' || value === 'visual' || value === 'both';
}

/**
 * The click volume the engine plays. Visual only still runs the engine's metronome, silently: the
 * playback (and its clock, which the beat display follows) runs as with clicks, and takes line up
 * the same way.
 */
export function clickVolume(output: MetronomeOutput, volume: number): number {
  return output === 'visual' ? 0 : volume;
}

/** Whether the beat display shows. */
export function showsBeats(output: MetronomeOutput): boolean {
  return output !== 'sound';
}

export type ClickAccent = 'bar' | 'group' | 'beat';

export type Click = { position: number; accent: ClickAccent };

/** The accent of beat number `beat` (0 = the first beat of 0:00's bar; negative before it). */
export function clickAccent(beat: number, beatsPerBar: number, beatUnit: number): ClickAccent {
  const inBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  if (inBar === 0) return 'bar';
  if (isCompound(beatsPerBar, beatUnit) && inBar % 3 === 0) return 'group';
  return 'beat';
}

/** Clicks at timeline positions in `[from, to)`, in order. Positions may be negative (the run-up). */
export function clicksBetween(meter: Meter, from: number, to: number): Click[] {
  const beat = beatSeconds(meter);
  if (!(beat > 0) || !(to > from)) return [];
  const clicks: Click[] = [];
  // Computed from the beat number (not by adding up), so there's no drift over a long take.
  for (let n = Math.ceil(from / beat - EPSILON); n * beat < to - EPSILON * beat; n++) {
    // `+ 0` turns the -0 that `Math.ceil` gives just below zero into 0.
    clicks.push({
      position: n * beat + 0,
      accent: clickAccent(n, meter.beatsPerBar, meter.beatUnit),
    });
  }
  return clicks;
}

export type BeatPosition = {
  /** Beat number on the grid: 0 = the first beat of 0:00's bar, negative before it. */
  beat: number;
  /** Place in its bar, 0 = the downbeat. */
  inBar: number;
  /** Seconds since the beat started. */
  sinceBeat: number;
};

/**
 * The beat that timeline position `time` falls in (the one whose click has sounded last), or `null`
 * for an unusable tempo or time. Runs on the UI thread too. Agrees with `clicksBetween`: at a
 * click's position this is that click's beat.
 */
export function beatAt(meter: Meter, time: number): BeatPosition | null {
  'worklet';
  const length = beatSeconds(meter);
  if (!(length > 0 && Number.isFinite(length)) || !Number.isFinite(time)) return null;
  const beat = Math.floor(time / length + EPSILON);
  const bar = meter.beatsPerBar;
  return {
    beat,
    inBar: ((beat % bar) + bar) % bar,
    sinceBeat: Math.max(0, time - beat * length),
  };
}

/**
 * How a bar's beats are grouped on screen: in threes for compound meters (6/8 → [3, 3]), otherwise
 * one group of the whole bar (7/8 → [7]).
 */
export function beatGroups(beatsPerBar: number, beatUnit: number): number[] {
  if (!isCompound(beatsPerBar, beatUnit)) return [beatsPerBar];
  return Array.from({ length: beatsPerBar / 3 }, () => 3);
}

const CLICK_SECONDS = 0.05;
const ATTACK_SECONDS = 0.001;
const DECAY_SECONDS = 0.012;
const CLICK_SOUND: Record<ClickAccent, { frequency: number; amplitude: number }> = {
  bar: { frequency: 1760, amplitude: 0.9 },
  group: { frequency: 1320, amplitude: 0.7 },
  beat: { frequency: 880, amplitude: 0.55 },
};

/**
 * One click as mono samples: a short sine "tick" with a 1 ms attack and a fast exponential decay,
 * faded to exactly zero at the end so it never clicks itself. Higher and louder when accented.
 */
export function clickSamples(accent: ClickAccent, sampleRate: number): Float32Array<ArrayBuffer> {
  const { frequency, amplitude } = CLICK_SOUND[accent];
  const length = Math.max(1, Math.round(CLICK_SECONDS * sampleRate));
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope =
      Math.min(1, t / ATTACK_SECONDS) * Math.exp(-t / DECAY_SECONDS) * (1 - i / length);
    samples[i] = amplitude * envelope * Math.sin(2 * Math.PI * frequency * t);
  }
  return samples;
}
