/**
 * Pure timeline geometry, shared by the JS thread and UI-thread worklets (gestures, drawing).
 * Units: time in seconds, lengths in points, zoom in points per second.
 * `scroll` is the time shown at the leading edge of the view.
 */

/** Most zoomed in: one second spans this many points. */
export const MAX_ZOOM = 400;
/** Empty time after the last clip, so there's room to scroll past the end. */
export const TAIL_SECONDS = 10;
/** Zoom an idea opens at (points per second), the same on every screen width: a phone shows about
 * 14 s (an idea that fits entirely is shown whole). */
export const DEFAULT_ZOOM = 28;
/** Quietest peak the waveforms are scaled up to fill the lane: quieter projects stay small. */
const MIN_SCALED_PEAK = 0.05;
/** Where the playhead settles while following playback: this fraction into the view. */
export const FOLLOW_ANCHOR = 1 / 3;

const LABEL_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
const MIN_LABEL_SPACING = 56;
const MIN_TICK_SPACING = 10;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Total scrollable time: the idea plus a tail. */
export function contentDuration(duration: number): number {
  'worklet';
  return duration + TAIL_SECONDS;
}

/** Most zoomed out: the whole idea (plus tail) fits in the view. */
export function minZoom(viewLength: number, duration: number): number {
  'worklet';
  return Math.min(MAX_ZOOM, viewLength / contentDuration(duration));
}

export function clampZoom(zoom: number, viewLength: number, duration: number): number {
  'worklet';
  return clamp(zoom, minZoom(viewLength, duration), MAX_ZOOM);
}

export function defaultZoom(viewLength: number, duration: number): number {
  'worklet';
  return clampZoom(DEFAULT_ZOOM, viewLength, duration);
}

export function maxScroll(viewLength: number, zoom: number, duration: number): number {
  'worklet';
  return Math.max(0, contentDuration(duration) - viewLength / zoom);
}

export function clampScroll(
  scroll: number,
  viewLength: number,
  zoom: number,
  duration: number,
): number {
  'worklet';
  return clamp(scroll, 0, maxScroll(viewLength, zoom, duration));
}

/** Point along the time axis (relative to the view) where `time` is drawn. */
export function timeToPoint(time: number, scroll: number, zoom: number): number {
  'worklet';
  return (time - scroll) * zoom;
}

export function pointToTime(point: number, scroll: number, zoom: number): number {
  'worklet';
  return scroll + point / zoom;
}

/** New scroll after zooming so that the time under `focalPoint` stays under it. */
export function zoomAroundPoint(
  scroll: number,
  zoom: number,
  nextZoom: number,
  focalPoint: number,
): number {
  'worklet';
  return pointToTime(focalPoint, scroll, zoom) - focalPoint / nextZoom;
}

/**
 * Scroll that keeps a moving playhead in view: once it passes `FOLLOW_ANCHOR` of the view it stays
 * there and the content moves under it. A playhead before the view jumps back to the anchor.
 */
export function followScroll(scroll: number, playhead: number, viewSeconds: number): number {
  'worklet';
  const anchor = viewSeconds * FOLLOW_ANCHOR;
  if (playhead < scroll || playhead > scroll + anchor) return Math.max(0, playhead - anchor);
  return scroll;
}

/** Ruler spacing for a zoom level: labelled ticks and the finer unlabelled ticks between them. */
export function rulerSteps(zoom: number): { label: number; tick: number } {
  'worklet';
  let label = LABEL_STEPS[LABEL_STEPS.length - 1] as number;
  for (const step of LABEL_STEPS) {
    if (step * zoom >= MIN_LABEL_SPACING) {
      label = step;
      break;
    }
  }
  let tick = label;
  for (const step of TICK_STEPS) {
    if (step >= label) break;
    const divisions = label / step;
    if (step * zoom >= MIN_TICK_SPACING && Math.abs(divisions - Math.round(divisions)) < 1e-6) {
      tick = step;
      break;
    }
  }
  return { label, tick };
}

/** `m:ss` for ruler labels (whole seconds). */
export function formatRulerTime(seconds: number): string {
  'worklet';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

/**
 * Index of the coarsest waveform level that still has at least one peak per half point, so paths
 * stay light when zoomed out. Level `i` has `finestPeaksPerSecond / factor^i` peaks per second.
 */
export function waveformLevel(
  finestPeaksPerSecond: number,
  zoom: number,
  levelCount: number,
  factor: number,
): number {
  'worklet';
  let level = 0;
  while (level < levelCount - 1 && finestPeaksPerSecond / Math.pow(factor, level + 1) >= zoom * 2) {
    level++;
  }
  return level;
}

/** Height of one track lane: fixed, so 5–6 lanes fit a phone and more scroll. */
export const LANE_HEIGHT = 88;
/** Width of the pinned track column left of the lanes: one grab handle per track (T23). */
export const CONTROLS_WIDTH = 30;
/** Width of that column expanded into the mixer (arm · mute · solo · volume). */
export const MIXER_WIDTH = 222;
/** Height of the "+ New Track" row after the last lane. */
export const NEW_TRACK_ROW_HEIGHT = 44;

/** How far the lanes can scroll down: every lane plus the footer row (e.g. "+ New Track"). */
export function laneScrollMax(
  viewport: number,
  trackCount: number,
  lane: number,
  footer: number,
): number {
  'worklet';
  return Math.max(0, trackCount * lane + footer - viewport);
}

/**
 * Lanes scrolled out of view above and below a viewport of `viewport` points at `scroll`. A lane counts
 * as hidden when less than half of it shows.
 */
export function hiddenLanes(
  scroll: number,
  viewport: number,
  lane: number,
  count: number,
): { above: number; below: number } {
  'worklet';
  let above = 0;
  let below = 0;
  for (let index = 0; index < count; index++) {
    const middle = (index + 0.5) * lane - scroll;
    if (middle < 0) above++;
    else if (middle > viewport) below++;
  }
  return { above, below };
}

/**
 * Lane scroll one page up (`direction` -1) or down (1): as many whole lanes as fit the viewport,
 * landing on a lane boundary, within 0…`max`.
 */
export function pageScroll(
  scroll: number,
  viewport: number,
  lane: number,
  direction: 1 | -1,
  max: number,
): number {
  'worklet';
  const page = Math.max(1, Math.floor(viewport / lane)) * lane;
  return clamp(Math.round((scroll + direction * page) / lane) * lane, 0, max);
}

/**
 * Vertical scale for every waveform of a project, from its loudest sample (0…1): the loudest take
 * fills its lane and the others keep their true (linear amplitude) proportions, so a take at half the
 * level draws at half the height. Near-silent projects are boosted at most 1 / `MIN_SCALED_PEAK`.
 */
export function waveformGain(loudestPeak: number): number {
  'worklet';
  return 1 / Math.max(loudestPeak, MIN_SCALED_PEAK);
}
