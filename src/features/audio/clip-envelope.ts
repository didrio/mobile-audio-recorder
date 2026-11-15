/**
 * A clip's gain over time (T16): its clip gain, a linear fade in and fade out, and a short automatic
 * declick fade on every edge, so a clip never starts or stops on a non-zero sample. The engine plays
 * each clip through its own `GainNode` driven by these points (`setValueAtTime` for the first, then
 * `linearRampToValueAtTime`), which reproduces the envelope exactly because it is linear between them.
 *
 * Where a split left two clips back to back on the same take (the second continues exactly where the
 * first stops, at the same gain), the joint is seamless: no declick there, so the audio runs straight
 * through as before the split. A fade the user set still applies.
 */

/** Length of the automatic fade on clip edges (seconds). */
export const DECLICK_SECONDS = 0.003;

export type EnvelopeClip = {
  /** Length on the timeline (seconds). */
  duration: number;
  /** Linear gain (1 = 0 dB). */
  gain: number;
  /** Fade lengths in seconds (0 = none). */
  fadeIn: number;
  fadeOut: number;
  /** Edges that join a seamless neighbor (`seamlessEdges`): no declick there. */
  seamlessIn?: boolean;
  seamlessOut?: boolean;
};

export type EnvelopePoint = { time: number; value: number };

/**
 * The fade lengths actually used: at least the declick on edges that aren't seamless, and scaled down
 * together when they'd overlap (a fade longer than a trimmed clip).
 */
export function effectiveFades(clip: EnvelopeClip): { fadeIn: number; fadeOut: number } {
  const duration = Math.max(0, clip.duration);
  let fadeIn = Math.max(clip.fadeIn, clip.seamlessIn ? 0 : DECLICK_SECONDS, 0);
  let fadeOut = Math.max(clip.fadeOut, clip.seamlessOut ? 0 : DECLICK_SECONDS, 0);
  const total = fadeIn + fadeOut;
  if (total > duration && total > 0) {
    fadeIn *= duration / total;
    fadeOut *= duration / total;
  }
  return { fadeIn, fadeOut };
}

/** The clip's gain at `time` seconds into it. */
export function envelopeAt(clip: EnvelopeClip, time: number): number {
  const { fadeIn, fadeOut } = effectiveFades(clip);
  const t = Math.min(Math.max(time, 0), clip.duration);
  let factor = 1;
  if (fadeIn > 0 && t < fadeIn) factor = Math.min(factor, t / fadeIn);
  if (fadeOut > 0 && t > clip.duration - fadeOut) {
    factor = Math.min(factor, (clip.duration - t) / fadeOut);
  }
  return Math.max(0, clip.gain * factor);
}

/**
 * The gain points for playing `length` seconds of the clip from `from` seconds into it, with times
 * relative to that start. Always starts with the value at `from`; later points are the envelope's
 * corners inside the piece and its end. A flat clip gives a single point.
 */
export function envelopePoints(clip: EnvelopeClip, from: number, length: number): EnvelopePoint[] {
  const { fadeIn, fadeOut } = effectiveFades(clip);
  const start = Math.min(Math.max(from, 0), clip.duration);
  const end = Math.min(Math.max(start + length, start), clip.duration);
  const corners = [fadeIn, clip.duration - fadeOut, end].filter(
    (corner) => corner > start && corner <= end,
  );
  // Every corner gets a point, flat stretches included: a ramp runs from the previous point.
  const points: EnvelopePoint[] = [{ time: 0, value: envelopeAt(clip, start) }];
  for (const corner of [...new Set(corners)].sort((a, b) => a - b)) {
    points.push({ time: corner - start, value: envelopeAt(clip, corner) });
  }
  // Nothing changes over the piece: one point is enough.
  return points.every((point) => point.value === points[0]!.value) ? [points[0]!] : points;
}

type JoinClip = {
  trackId: string;
  takePath: string;
  start: number;
  offset: number;
  duration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
};

/** How close two times must be to count as the same moment (float noise from edits). */
const JOIN_EPSILON = 1e-6;

/**
 * Marks the edges where a clip continues seamlessly into the next one: same track and take, the next
 * starts where this one ends at the matching take offset, same gain, and no fade on either side.
 */
export function seamlessEdges<T extends JoinClip>(
  clips: readonly T[],
): (T & { seamlessIn: boolean; seamlessOut: boolean })[] {
  const marked = clips.map((clip) => ({ ...clip, seamlessIn: false, seamlessOut: false }));
  for (const a of marked) {
    if (a.fadeOut > 0) continue;
    const end = a.start + a.duration;
    for (const b of marked) {
      if (
        b === a ||
        b.fadeIn > 0 ||
        b.trackId !== a.trackId ||
        b.takePath !== a.takePath ||
        b.gain !== a.gain ||
        Math.abs(b.start - end) > JOIN_EPSILON ||
        Math.abs(b.offset - (a.offset + a.duration)) > JOIN_EPSILON
      ) {
        continue;
      }
      a.seamlessOut = true;
      b.seamlessIn = true;
    }
  }
  return marked;
}
