import { useEffect, useRef, useState } from 'react';

/** A buffer peaking at or above this (about −0.2 dBFS) counts as clipped. */
export const CLIP_LEVEL = 0.98;
/** How long the meter stays red after the last clipped buffer. */
export const CLIP_HOLD_MS = 1500;

export function isClip(peak: number): boolean {
  return peak >= CLIP_LEVEL;
}

/**
 * The meter's clip indicator (T38): `report` every buffer's peak; `clipped` turns true on a clipped
 * one and stays true until `CLIP_HOLD_MS` after the last.
 */
export function useClipHold(): {
  clipped: boolean;
  report: (peak: number) => void;
  reset: () => void;
} {
  const [clipped, setClipped] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const report = (peak: number) => {
    if (!isClip(peak)) return;
    setClipped(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setClipped(false), CLIP_HOLD_MS);
  };
  const reset = () => {
    clearTimeout(timer.current);
    setClipped(false);
  };
  return { clipped, report, reset };
}
