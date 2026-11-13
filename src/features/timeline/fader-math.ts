/**
 * Volume slider math. A slider position (0 = left / silent end, 1 = right) maps linearly to decibels between
 * `MIN_DB` and `MAX_DB`, and the very start is silence. Gains are linear (1 = 0 dB), as stored in
 * `tracks.volume` and applied by the engine.
 */

export const MIN_DB = -48;
export const MAX_DB = 6;
/** A finger move this long (points) sweeps the whole range: a bit longer than the slider, for precision. */
export const FADER_DRAG_RANGE = 160;
/** Within this many dB of 0 the slider snaps to exactly 0 dB, so unity is easy to hit. */
const UNITY_SNAP_DB = 0.4;

export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}

export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : Math.pow(10, db / 20);
}

export function gainToPosition(gain: number): number {
  if (gain <= 0) return 0;
  return clamp01((gainToDb(gain) - MIN_DB) / (MAX_DB - MIN_DB));
}

/** Gain at a slider position, snapping to 0 dB near unity. */
export function positionToGain(position: number): number {
  if (position <= 0) return 0;
  const db = MIN_DB + (MAX_DB - MIN_DB) * clamp01(position);
  return Math.abs(db) < UNITY_SNAP_DB ? 1 : dbToGain(db);
}

/** Slider position after dragging `translation` points (towards louder is positive) from `startPosition`. */
export function dragPosition(startPosition: number, translation: number): number {
  return clamp01(startPosition + translation / FADER_DRAG_RANGE);
}

/** Gain `steps` dB louder (or quieter when negative), for screen-reader increment / decrement. */
export function stepGain(gain: number, steps: number): number {
  if (gain <= 0) return steps > 0 ? dbToGain(MIN_DB) : 0;
  const db = Math.round(gainToDb(gain)) + steps;
  if (db < MIN_DB) return 0;
  return dbToGain(Math.min(MAX_DB, db));
}

/** "0.0 dB", "+2.5 dB", "−6.0 dB", "−∞ dB" (typographic minus). */
export function formatDb(gain: number): string {
  if (gain <= 0) return '−∞ dB';
  const db = Math.round(gainToDb(gain) * 10) / 10;
  if (db === 0) return '0.0 dB';
  return `${db > 0 ? '+' : '−'}${Math.abs(db).toFixed(1)} dB`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
