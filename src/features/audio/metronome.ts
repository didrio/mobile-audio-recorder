/**
 * The metronome's clicks, as pure functions (no React, no audio context): where they fall on the
 * timeline and what they sound like. The engine schedules them (`audio-engine.ts`).
 *
 * Clicks sit on the timeline's beat grid from 0:00 (`tempo.ts`), so they line up with the bar lines
 * and with takes. The grid continues before 0:00, which makes the pre-roll's run-up a count-in.
 * Accents: the first beat of a bar is the strongest; compound meters (6/8, 12/8) also accent the
 * start of each group of three eighths.
 */
import { beatSeconds, isCompound, type Meter } from './tempo';

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

/** Rounding slack in beats, so a position computed as 1.9999999 still counts as beat 2. */
const EPSILON = 1e-9;

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
