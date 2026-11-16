/** Position along a scrubber of `width` points, 0..1 (a touch outside the bar clamps). */
export function scrubFraction(x: number, width: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x / width));
}

/** How far playback has got, 0..1; 0 when the length is unknown or the position isn't known yet. */
export function playedFraction(position: number | null, duration: number): number {
  if (position === null || !(duration > 0)) return 0;
  return Math.min(1, Math.max(0, position / duration));
}
