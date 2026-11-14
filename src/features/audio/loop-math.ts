/**
 * The loop region's math (T26), as pure worklet-safe functions: where looped playback is after a
 * given time, which loop iterations fall in a scheduling window, which piece of each clip plays in
 * an iteration, and the region's default and edge drags. Used by the audio engine (scheduling on
 * the context clock), the transport (playhead) and the timeline (handles).
 *
 * A looped playback from `from` plays `[from, end)` once (iteration 0), then `[start, end)` over and
 * over. Times are seconds; "elapsed" is time since the playback's first sound.
 */
import { barSeconds, type Meter } from './tempo';

export type LoopRegion = { start: number; end: number };

/** Crossfade at the wrap: a clip cut at the loop end rings on this long while fading out. */
export const LOOP_FADE_SECONDS = 0.005;
/** A new region without the grid: this long from the playhead. */
export const DEFAULT_LOOP_SECONDS = 8;
/** A new region with the grid on: this many bars from the playhead's bar. */
export const DEFAULT_LOOP_BARS = 2;
/** The shortest region without the grid (with it: one bar). */
export const MIN_LOOP_SECONDS = 1;

/** One pass over part of the timeline: timeline `start` sounds at `elapsed`. */
export type LoopSegment = {
  /** 0 for the first pass (from where playback started), then 1, 2, … for each wrap. */
  index: number;
  elapsed: number;
  start: number;
  /** `Infinity` for playback that doesn't loop. */
  end: number;
};

function isLoop(region: LoopRegion | null): region is LoopRegion {
  'worklet';
  return region != null && region.end > region.start;
}

/** Where looped playback starts: the playhead if it's inside the region, else the region start. */
export function loopStartPosition(playhead: number, region: LoopRegion): number {
  'worklet';
  return playhead >= region.start && playhead < region.end ? playhead : region.start;
}

/** Timeline position `elapsed` seconds after a playback from `from` started (linear without a loop). */
export function loopedPosition(from: number, region: LoopRegion | null, elapsed: number): number {
  'worklet';
  if (!isLoop(region)) return from + elapsed;
  const first = Math.max(0, region.end - from);
  if (elapsed < first) return from + elapsed;
  // From the elapsed time each call (not by adding up), so a long loop doesn't drift.
  return region.start + ((elapsed - first) % (region.end - region.start));
}

/**
 * The passes of a playback from `from` that overlap the elapsed window `[fromElapsed, toElapsed)`.
 * Without a loop that's one endless pass.
 */
export function loopSegments(
  from: number,
  region: LoopRegion | null,
  fromElapsed: number,
  toElapsed: number,
): LoopSegment[] {
  'worklet';
  if (!(toElapsed > fromElapsed)) return [];
  if (!isLoop(region)) return [{ index: 0, elapsed: 0, start: from, end: Infinity }];
  const first = Math.max(0, region.end - from);
  const length = region.end - region.start;
  const segments: LoopSegment[] = [];
  if (fromElapsed < first) {
    segments.push({ index: 0, elapsed: 0, start: from, end: region.end });
  }
  // Pass k ≥ 1 sounds during [first + (k − 1)·length, first + k·length).
  let k = Math.max(1, Math.floor((fromElapsed - first) / length) + 1);
  for (; first + (k - 1) * length < toElapsed; k++) {
    segments.push({
      index: k,
      elapsed: first + (k - 1) * length,
      start: region.start,
      end: region.end,
    });
  }
  return segments;
}

/** What plays of one clip in one pass, on the elapsed clock. */
export type ClipPiece<T> = {
  clip: T;
  /** When it starts (elapsed), where in the take, and for how long (fade-out tail included). */
  at: number;
  offset: number;
  duration: number;
  /** Fade-in length at its start (0: none): the clip was cut at the loop start. */
  fadeIn: number;
  /** Fade-out length after the loop end (0: none): the clip was cut there and rings on this long. */
  fadeOut: number;
  /** When the fade-out starts (elapsed): the loop end. */
  fadeOutAt: number;
};

/** The piece of each clip that plays in `segment`, with crossfades where the loop cuts a clip. */
export function clipPieces<T extends { start: number; offset: number; duration: number }>(
  clips: readonly T[],
  segment: LoopSegment,
): ClipPiece<T>[] {
  'worklet';
  const pieces: ClipPiece<T>[] = [];
  for (const clip of clips) {
    const clipEnd = clip.start + clip.duration;
    const from = Math.max(clip.start, segment.start);
    const to = Math.min(clipEnd, segment.end);
    if (!(to > from)) continue;
    const length = to - from;
    const fadeIn =
      segment.index > 0 && clip.start < segment.start ? Math.min(LOOP_FADE_SECONDS, length) : 0;
    const fadeOut = clipEnd > segment.end ? Math.min(LOOP_FADE_SECONDS, clipEnd - segment.end) : 0;
    const at = segment.elapsed + (from - segment.start);
    pieces.push({
      clip,
      at,
      offset: clip.offset + (from - clip.start),
      duration: length + fadeOut,
      fadeIn,
      fadeOut,
      fadeOutAt: at + length,
    });
  }
  return pieces;
}

/** A new region: two bars from the start of the playhead's bar (grid on), else 8 s from the playhead. */
export function defaultLoopRegion(
  playhead: number,
  { grid, meter }: { grid: boolean; meter: Meter },
): LoopRegion {
  'worklet';
  const at = Math.max(0, playhead);
  if (grid) {
    const bar = barSeconds(meter);
    if (bar > 0) {
      const start = Math.floor(at / bar + 1e-9) * bar;
      return { start, end: start + DEFAULT_LOOP_BARS * bar };
    }
  }
  return { start: at, end: at + DEFAULT_LOOP_SECONDS };
}

export const LOOP_EDGE_START = 1;
export const LOOP_EDGE_END = 2;
export type LoopEdge = typeof LOOP_EDGE_START | typeof LOOP_EDGE_END;

/**
 * The region with one edge dragged to `time`: rounded to `step` (0: free), never before 0:00, and
 * never closer than `minLength` to the other edge.
 */
export function dragLoopEdge(
  region: LoopRegion,
  edge: LoopEdge,
  time: number,
  { step, minLength }: { step: number; minLength: number },
): LoopRegion {
  'worklet';
  const t = step > 0 ? Math.round(time / step) * step : time;
  if (edge === LOOP_EDGE_START) {
    return { start: Math.max(0, Math.min(t, region.end - minLength)), end: region.end };
  }
  return { start: region.start, end: Math.max(t, region.start + minLength, minLength) };
}
