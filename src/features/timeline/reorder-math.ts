/**
 * Math for dragging a track to a new place (T23). All worklets: the drag runs on the UI thread and
 * only the drop goes to JS.
 *
 * Positions are in lane content coordinates: lane `i` normally sits at `i * lane` (before the lanes'
 * vertical scroll).
 */

// Declared before its callers: worklet functions aren't hoisted once the worklets plugin transforms them.
function clampUnit(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

/** `items` with the one at `from` moved to `to` (both clamped to the array). */
export function moveIndex<T>(items: readonly T[], from: number, to: number): T[] {
  'worklet';
  const next = items.slice();
  if (from < 0 || from >= items.length) return next;
  const target = Math.min(Math.max(0, to), items.length - 1);
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** The slot under the center of the dragged lane, whose top is at `dragTop`. */
export function dropIndex(dragTop: number, lane: number, count: number): number {
  'worklet';
  if (count <= 0 || lane <= 0) return 0;
  const slot = Math.floor((dragTop + lane / 2) / lane);
  return Math.min(Math.max(0, slot), count - 1);
}

/**
 * How far lane `index` slides aside while the lane lifted from `from` hovers over slot `progress`
 * (the drop slot, animated, so it can be between two slots and the lanes glide). Lanes between the
 * two move one lane toward `from`; the lifted lane itself isn't shifted (it follows the finger).
 */
export function laneShift(index: number, from: number, progress: number, lane: number): number {
  'worklet';
  if (from < 0 || index === from) return 0;
  const amount =
    index > from ? -clampUnit(progress - (index - 1)) : clampUnit(index + 1 - progress);
  return amount === 0 ? 0 : amount * lane;
}

/**
 * The slot lane `index` is heading to while the lane lifted from `from` would drop into `target`
 * (whole slots, not animated). Lanes take that slot's stripe color as soon as they start sliding, so
 * the rows keep alternating throughout the drag instead of recoloring after the drop.
 */
export function laneSlotDuringDrag(index: number, from: number, target: number): number {
  'worklet';
  if (from < 0) return index;
  if (index === from) return target;
  if (index > from && index <= target) return index - 1;
  if (index < from && index >= target) return index + 1;
  return index;
}

/**
 * Where lane `index` is drawn (content y of its top) during a drag. `from` is the lifted lane's index
 * (-1: no drag), `dragTop` where the lifted lane is.
 */
export function laneTopDuringDrag(
  index: number,
  lane: number,
  from: number,
  dragTop: number,
  progress: number,
): number {
  'worklet';
  if (index === from) return dragTop;
  return index * lane + laneShift(index, from, progress, lane);
}

/**
 * Auto-scroll speed (points per second) for a finger at `y` in a viewport `viewport` tall: negative
 * (scroll up) inside the top `edge` band, positive inside the bottom one, faster the closer to the
 * edge (up to `maxSpeed` at or beyond it), 0 in between.
 */
export function autoScrollSpeed(
  y: number,
  viewport: number,
  edge: number,
  maxSpeed: number,
): number {
  'worklet';
  if (viewport <= 0 || edge <= 0) return 0;
  const band = Math.min(edge, viewport / 2);
  if (y < band) return -maxSpeed * clampUnit((band - y) / band);
  if (y > viewport - band) return maxSpeed * clampUnit((y - (viewport - band)) / band);
  return 0;
}
