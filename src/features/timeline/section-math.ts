/**
 * Pure geometry of section labels (T18) on the rail above the ruler, shared by the edit commands, the
 * gesture worklets and tests. Sections are spans `start…start + duration` (seconds), ordered by start,
 * that never overlap: a drag stops at the neighbors instead of passing them.
 */
import { DRAG_MOVE, DRAG_TRIM_END, DRAG_TRIM_START, type DragPart } from './clip-edit-math';

export type SectionWindow = { start: number; duration: number };
/** Where a section may lie: from its previous neighbor's end to its next neighbor's start. */
export type SectionBounds = { min: number; max: number };

/** Index of the section covering `time`, or -1. */
export function sectionAt(sections: readonly SectionWindow[], time: number): number {
  'worklet';
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    if (time >= section.start && time <= section.start + section.duration) return index;
  }
  return -1;
}

/** The room section `index` has between its neighbors (0:00 and no limit at the ends). */
export function neighborBounds(sections: readonly SectionWindow[], index: number): SectionBounds {
  'worklet';
  const previous = sections[index - 1];
  const next = sections[index + 1];
  return {
    min: previous ? previous.start + previous.duration : 0,
    max: next ? next.start : Infinity,
  };
}

/** `window` fitted into `bounds`: shortened if it can't fit, then moved (keeping its length) inside. */
export function clampSection(window: SectionWindow, bounds: SectionBounds): SectionWindow {
  'worklet';
  const duration = Math.min(window.duration, bounds.max - bounds.min);
  const start = Math.min(Math.max(window.start, bounds.min), bounds.max - duration);
  return { start, duration };
}

function quantize(time: number, step: number): number {
  'worklet';
  return step > 0 ? Math.round(time / step) * step : time;
}

/**
 * The window after dragging `part` of a section by `delta` seconds. Moving keeps the length; a handle
 * moves one edge and leaves at least `minDuration` (or all the room there is). With `step` > 0 the
 * moved edges land on multiples of it (whole bars). Either way the section stays within `bounds`.
 */
export function dragSection(
  part: DragPart,
  origin: SectionWindow,
  delta: number,
  bounds: SectionBounds,
  options: { step: number; minDuration: number },
): SectionWindow {
  'worklet';
  const { step } = options;
  const end = origin.start + origin.duration;
  if (part === DRAG_MOVE) {
    const start = quantize(origin.start + delta, step);
    return {
      start: Math.min(
        Math.max(start, bounds.min),
        Math.max(bounds.min, bounds.max - origin.duration),
      ),
      duration: origin.duration,
    };
  }
  if (part === DRAG_TRIM_START) {
    const latest = Math.max(bounds.min, end - options.minDuration);
    const start = Math.min(Math.max(quantize(origin.start + delta, step), bounds.min), latest);
    return { start, duration: end - start };
  }
  if (part === DRAG_TRIM_END) {
    const earliest = Math.min(bounds.max, origin.start + options.minDuration);
    const next = Math.max(Math.min(quantize(end + delta, step), bounds.max), earliest);
    return { start: origin.start, duration: next - origin.start };
  }
  return origin;
}

/**
 * Where a section added by tapping the rail at `time` goes: from the tap (the start of the bar it's
 * in with `step` > 0; pulled onto the previous section's end, or 0:00, within `reach`) for
 * `defaultLength`, cut short where the next section starts. `null` when the tap is on a section or
 * less than `minLength` fits.
 */
export function newSectionWindow(
  time: number,
  sections: readonly SectionWindow[],
  options: { step: number; defaultLength: number; minLength: number; reach: number },
): SectionWindow | null {
  'worklet';
  if (sectionAt(sections, time) >= 0) return null;
  let previousEnd = 0;
  let nextStart = Infinity;
  for (const section of sections) {
    if (section.start > time) {
      nextStart = Math.min(nextStart, section.start);
    } else {
      previousEnd = Math.max(previousEnd, section.start + section.duration);
    }
  }
  let start = Math.max(0, time);
  if (options.step > 0) start = Math.floor(start / options.step + 1e-9) * options.step;
  if (start < previousEnd || start - previousEnd <= options.reach) start = previousEnd;
  const end = Math.min(start + options.defaultLength, nextStart);
  if (end - start < options.minLength) return null;
  return { start, duration: end - start };
}

const ELLIPSIS = '…';

/** `text`, or as much of it as fits in `maxWidth` followed by "…" ('' if not even that fits). */
export function truncateLabel(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  'worklet';
  if (measure(text) <= maxWidth) return text;
  if (measure(ELLIPSIS) > maxWidth) return '';
  let low = 0;
  let high = text.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low === 0 ? ELLIPSIS : text.slice(0, low).trimEnd() + ELLIPSIS;
}
