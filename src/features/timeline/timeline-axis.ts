/**
 * The timeline is drawn and driven in two abstract axes, written once for both orientations:
 *
 * - **time**: along which seconds advance (x in landscape, y downwards in portrait);
 * - **cross**: along which tracks are stacked (y in landscape = rows, x in portrait = columns).
 *
 * Drawing code works in (time, cross) and applies `axisMatrix` to the canvas. Gesture code converts
 * touch points with `toAxes`. Text is never drawn through the matrix (it would be mirrored); place
 * it with `fromAxes` instead.
 */

export type Orientation = 'portrait' | 'landscape';

export type AxisPoint = { time: number; cross: number };

export function orientationOf(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait';
}

export function toAxes(orientation: Orientation, x: number, y: number): AxisPoint {
  'worklet';
  return orientation === 'landscape' ? { time: x, cross: y } : { time: y, cross: x };
}

export function fromAxes(orientation: Orientation, time: number, cross: number) {
  'worklet';
  return orientation === 'landscape' ? { x: time, y: cross } : { x: cross, y: time };
}

/** Lengths of a `width` × `height` area along the time and cross axes. */
export function axisLengths(orientation: Orientation, width: number, height: number) {
  'worklet';
  const { time, cross } = toAxes(orientation, width, height);
  return { time, cross };
}

/** Identity in landscape; swaps x and y in portrait. Row-major 3×3. */
export function axisMatrix(orientation: Orientation): number[] {
  'worklet';
  return orientation === 'landscape' ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [0, 1, 0, 1, 0, 0, 0, 0, 1];
}
