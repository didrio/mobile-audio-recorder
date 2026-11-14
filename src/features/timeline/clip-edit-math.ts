/**
 * Pure math for selecting and dragging items on the timeline (clips now, section labels in T18),
 * shared by the gesture worklets and tests. An item sits on a row from `start` for `duration`
 * seconds, and shows the window `offset…offset + duration` of a source (a clip's take) that is
 * `sourceDuration` long. Times are seconds on the timeline.
 */

/** What a drag does to the item it grabbed. */
export const DRAG_NONE = 0;
export const DRAG_MOVE = 1;
export const DRAG_TRIM_START = 2;
export const DRAG_TRIM_END = 3;
export type DragPart =
  typeof DRAG_NONE | typeof DRAG_MOVE | typeof DRAG_TRIM_START | typeof DRAG_TRIM_END;

export type ItemWindow = { start: number; offset: number; duration: number };

/** Index of the item on `row` that covers `time`, or -1. */
export function itemAt(
  items: readonly { start: number; duration: number; row: number }[],
  time: number,
  row: number,
): number {
  'worklet';
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    if (item.row === row && time >= item.start && time <= item.start + item.duration) return index;
  }
  return -1;
}

/**
 * The part of a selected item a touch at `time` grabs: an edge (trim) within `reach` seconds of it,
 * outside or inside the item, or the body (move). The middle half of the item is always the body,
 * so a narrow item can still be moved. `DRAG_NONE` when the touch misses it.
 */
export function grabPart(
  item: { start: number; duration: number },
  time: number,
  reach: number,
): DragPart {
  'worklet';
  const end = item.start + item.duration;
  if (time < item.start - reach || time > end + reach) return DRAG_NONE;
  const inner = Math.min(reach, item.duration / 4);
  if (time < item.start + inner) return DRAG_TRIM_START;
  if (time > end - inner) return DRAG_TRIM_END;
  return DRAG_MOVE;
}

/**
 * The window after dragging `part` by `delta` seconds. Moving keeps the window and stops at 0:00.
 * Trimming moves one edge: it can reveal the source back out to its bounds (never before its start
 * or past its end, nor before 0:00) and leaves at least `minDuration`.
 */
export function dragWindow(
  part: DragPart,
  origin: ItemWindow,
  delta: number,
  sourceDuration: number,
  minDuration: number,
): ItemWindow {
  'worklet';
  if (part === DRAG_MOVE) {
    return { ...origin, start: Math.max(0, origin.start + delta) };
  }
  if (part === DRAG_TRIM_START) {
    const min = Math.max(-origin.offset, -origin.start);
    const max = Math.max(min, origin.duration - minDuration);
    const d = Math.min(Math.max(delta, min), max);
    return { start: origin.start + d, offset: origin.offset + d, duration: origin.duration - d };
  }
  if (part === DRAG_TRIM_END) {
    const max = sourceDuration - origin.offset - origin.duration;
    const min = Math.min(max, minDuration - origin.duration);
    const d = Math.min(Math.max(delta, min), max);
    return { ...origin, duration: origin.duration + d };
  }
  return origin;
}

/** The candidate within `threshold` of `time` that is closest to it, or `null`. */
export function nearestSnap(
  time: number,
  candidates: readonly number[],
  threshold: number,
): number | null {
  'worklet';
  let best: number | null = null;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - time);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snaps a drag of `part` by `delta`: the edges it moves (both for a move, one for a trim) are pulled
 * onto the nearest candidate within `threshold`. Returns the snapped delta and the time snapped to
 * (-1 when nothing was in reach).
 */
export function snapDrag(
  part: DragPart,
  origin: { start: number; duration: number },
  delta: number,
  candidates: readonly number[],
  threshold: number,
): { delta: number; snapTime: number } {
  'worklet';
  const start = origin.start + delta;
  const end = start + origin.duration;
  const toStart =
    part === DRAG_MOVE || part === DRAG_TRIM_START
      ? nearestSnap(start, candidates, threshold)
      : null;
  const toEnd =
    part === DRAG_MOVE || part === DRAG_TRIM_END ? nearestSnap(end, candidates, threshold) : null;
  if (toStart == null && toEnd == null) return { delta, snapTime: -1 };
  if (toEnd == null || (toStart != null && Math.abs(toStart - start) <= Math.abs(toEnd - end))) {
    return { delta: delta + (toStart! - start), snapTime: toStart! };
  }
  return { delta: delta + (toEnd - end), snapTime: toEnd };
}

/** The row under `y` (points from the top of the rows, scrolled by `scroll`), within 0…count-1. */
export function rowAt(y: number, scroll: number, rowHeight: number, count: number): number {
  'worklet';
  return Math.min(Math.max(0, Math.floor((y + scroll) / rowHeight)), Math.max(0, count - 1));
}
