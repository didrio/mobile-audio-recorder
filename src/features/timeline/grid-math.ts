/**
 * Zoom-dependent geometry of the bar/beat grid, for the timeline's drawing and snapping (worklets).
 * Tempo and meter themselves: `@/features/audio/tempo`. Times in seconds, spacing in points, zoom in
 * points per second.
 */
import { barSeconds, beatSeconds, type Meter } from '@/features/audio/tempo';

/** Bar lines never get closer than this (points); zoomed out further they thin to every 2nd, 4th… bar. */
const MIN_BAR_SPACING = 12;
/** Bar numbers on the ruler need this much room (points). */
const MIN_BAR_LABEL_SPACING = 40;
/** Beat lines fade in between these spacings (points) and are gone below the first. */
const BEAT_FADE_FROM = 8;
const BEAT_FADE_TO = 18;

export type GridSteps = {
  /** Bars between drawn bar lines (1, 2, 4, …). */
  lineEvery: number;
  /** Bars between ruler numbers (a multiple of `lineEvery`). */
  labelEvery: number;
  /** Opacity (0…1) of the beat lines; 0 when they're too close to draw. Only with `lineEvery` 1. */
  beatAlpha: number;
};

/** The smallest power of two ≥ 1 that makes `step * count * zoom` at least `minSpacing`. */
function barsFor(step: number, zoom: number, minSpacing: number): number {
  'worklet';
  let count = 1;
  while (step * count * zoom < minSpacing && count < 4096) count *= 2;
  return count;
}

export function gridSteps(meter: Meter, zoom: number): GridSteps {
  'worklet';
  const bar = barSeconds(meter);
  const lineEvery = barsFor(bar, zoom, MIN_BAR_SPACING);
  const labelEvery = barsFor(bar, zoom, MIN_BAR_LABEL_SPACING);
  const spacing = beatSeconds(meter) * zoom;
  const fade = (spacing - BEAT_FADE_FROM) / (BEAT_FADE_TO - BEAT_FADE_FROM);
  const beatAlpha = lineEvery === 1 ? Math.min(1, Math.max(0, fade)) : 0;
  return { lineEvery, labelEvery: Math.max(labelEvery, lineEvery), beatAlpha };
}

/**
 * Distance (seconds) between the lines a drag snaps to: beats while they're drawn, otherwise the
 * visible bar lines.
 */
export function gridSnapStep(meter: Meter, zoom: number): number {
  'worklet';
  const steps = gridSteps(meter, zoom);
  return steps.beatAlpha > 0 ? beatSeconds(meter) : barSeconds(meter) * steps.lineEvery;
}

/** The grid line (multiple of `step`, at or after 0:00) within `threshold` of `time`, or `null`. */
export function nearestGridLine(time: number, step: number, threshold: number): number | null {
  'worklet';
  if (step <= 0) return null;
  const line = Math.max(0, Math.round(time / step) * step);
  return Math.abs(line - time) <= threshold ? line : null;
}

/** What a grid line at beat index `beat` (0 = start of the song) is: a bar line, a group, or a beat. */
export const LINE_BAR = 0;
export const LINE_GROUP = 1;
export const LINE_BEAT = 2;
export type LineKind = typeof LINE_BAR | typeof LINE_GROUP | typeof LINE_BEAT;

export function lineKind(beat: number, beatsPerBar: number, compound: boolean): LineKind {
  'worklet';
  const inBar = beat % beatsPerBar;
  if (inBar === 0) return LINE_BAR;
  return compound && inBar % 3 === 0 ? LINE_GROUP : LINE_BEAT;
}
