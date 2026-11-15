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

/**
 * Which live-waveform peaks to draw while recording, and how wide a bar is. Peak `i` covers
 * `peaksStart + i / perSecond` (the take file's start, which with pre-roll is the run-up, before
 * the punch); only `from`…`to` (timeline seconds) is drawn. `step` merges peaks so there's about
 * one bar per point. Returns `null` when nothing falls in range.
 */
export function livePeakRange(live: {
  count: number;
  perSecond: number;
  peaksStart: number;
  from: number;
  to: number;
  zoom: number;
}): { first: number; last: number; step: number; width: number } | null {
  'worklet';
  const step = Math.max(1, Math.floor(live.perSecond / live.zoom));
  const first = Math.max(
    0,
    Math.floor(((live.from - live.peaksStart) * live.perSecond) / step) * step,
  );
  const last = Math.min(live.count, Math.ceil((live.to - live.peaksStart) * live.perSecond));
  if (last <= first) return null;
  return { first, last, step, width: Math.max(1, (step / live.perSecond) * live.zoom) };
}

/** Point where live peak `peak` is drawn, given the point of the take file's start (`peaksStart`). */
export function livePeakPoint(
  peaksStartPoint: number,
  peak: number,
  perSecond: number,
  zoom: number,
): number {
  'worklet';
  return peaksStartPoint + (peak / perSecond) * zoom;
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

/**
 * Which way the timeline runs: time left → right with tracks as rows, or (experimental, T43) time top →
 * bottom with tracks as columns. The timeline works in two logical axes either way: `t` along time and `l`
 * across it (section rail, ruler, then the lanes); vertical swaps which one is x.
 */
export type Orientation = 'horizontal' | 'vertical';

/** Height of one track lane: fixed, so 5–6 lanes fit a phone and more scroll. */
export const LANE_HEIGHT = 88;
/** Width of the pinned track column left of the lanes: one grab handle per track (T23). */
export const CONTROLS_WIDTH = 38;
/** Width of that column expanded into the mixer (arm · mute · solo · volume). */
export const MIXER_WIDTH = 230;
/** The "+ New Track" row after the last lane: its height (horizontal) or its width as a column (vertical). */
export const NEW_TRACK_SIZE = 44;

/** Vertical timeline: the track header row along the top is a band with each track's grab handle (in the
 * mixer, its info button) over a band with its name pill. */
export const GRIP_BAND = 22;
export const PILL_BAND = 30;
export const TRACK_ROW_HEIGHT = GRIP_BAND + PILL_BAND;
/** The header row expanded into the mixer: Mute · Solo and a volume slider under each name. */
export const MIXER_ROW_HEIGHT = TRACK_ROW_HEIGHT + 80;
/** Vertical timeline: up to this many lanes share the width (beside "+ New Track"); more scroll sideways. */
export const MAX_VISIBLE_LANES = 4;

/** A point on the timeline's view in logical axes: `t` along time, `l` across it. */
export function logicalPoint(x: number, y: number, vertical: boolean): { t: number; l: number } {
  'worklet';
  return vertical ? { t: y, l: x } : { t: x, l: y };
}

/**
 * Width of a lane (column) in the vertical timeline, whose lanes show `viewport` points wide. Up to
 * `MAX_VISIBLE_LANES` tracks fill the width beside the `footer` column ("+ New Track"), so it's always in
 * view until there are more; then each lane keeps that share, the next one peeks in at the edge and the
 * rest scroll sideways. Whole points, at least 1.
 */
export function verticalLaneSize(viewport: number, count: number, footer: number): number {
  'worklet';
  const visible = Math.min(Math.max(1, count), MAX_VISIBLE_LANES);
  return Math.max(1, Math.floor(Math.max(0, viewport - footer) / visible));
}

export type TimelineLayout = {
  vertical: boolean;
  /** The track controls band across time: the column's width (horizontal) or the header row's height. */
  controls: number;
  /** The time area (the canvas) along time, and across it (rail + ruler + lanes). */
  viewLength: number;
  crossLength: number;
  /** How much of the lanes shows across time (after the rail and ruler). */
  lanesViewport: number;
  /** A lane's size across time: its height (horizontal) or its width (vertical). */
  lane: number;
};

/**
 * Where everything goes in a `width` × `height` timeline. Horizontal: the controls column on the left (the
 * mixer never wider than half the view, so some timeline stays visible), the time area right of it with
 * fixed-height lanes. Vertical: the header row on top (the mixer at most half the height), the time area
 * below it, lanes sized by `verticalLaneSize`. `headerSize` is the rail + ruler.
 */
export function timelineLayout(
  orientation: Orientation,
  width: number,
  height: number,
  {
    trackCount,
    mixerOpen,
    headerSize,
  }: { trackCount: number; mixerOpen: boolean; headerSize: number },
): TimelineLayout {
  if (orientation === 'vertical') {
    const controls = mixerOpen
      ? Math.max(TRACK_ROW_HEIGHT, Math.min(MIXER_ROW_HEIGHT, height / 2))
      : TRACK_ROW_HEIGHT;
    const lanesViewport = Math.max(0, width - headerSize);
    return {
      vertical: true,
      controls,
      viewLength: Math.max(0, height - controls),
      crossLength: width,
      lanesViewport,
      lane: verticalLaneSize(lanesViewport, trackCount, NEW_TRACK_SIZE),
    };
  }
  const controls = mixerOpen
    ? Math.max(CONTROLS_WIDTH, Math.min(MIXER_WIDTH, width / 2 + CONTROLS_WIDTH))
    : CONTROLS_WIDTH;
  return {
    vertical: false,
    controls,
    viewLength: Math.max(0, width - controls),
    crossLength: height,
    lanesViewport: Math.max(0, height - headerSize),
    lane: LANE_HEIGHT,
  };
}

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
