/**
 * Where a take recorded over other tracks belongs on the timeline.
 *
 * The recorder can't be started at a time on the `AudioContext` clock, so the engine starts the
 * backing playback first, then the recorder, and measures (on the context clock):
 * - `playbackStartedAt`: when timeline position `from` was sent to the output;
 * - `recorderStartedAt`: when the file's first sample was captured.
 *
 * A performer hears position `p` `outputLatency` after it's sent, and what they play reaches the
 * file `inputLatency` after it's captured, so the take lands late by both. `manualOffset` corrects
 * what the platform doesn't report (positive moves takes earlier).
 */

export type TakeAlignment = {
  playbackStartedAt: number;
  recorderStartedAt: number;
  outputLatency: number;
  inputLatency: number;
};

export type TakePlacement = {
  /** Timeline position of the clip, ≥ 0. */
  start: number;
  /** Seconds skipped at the beginning of the take (when the compensated start fell before 0). */
  offset: number;
};

/**
 * Clip placement for a take whose recording began at timeline position `from`. Without an
 * alignment (nothing was playing) there's nothing to line up with: the take starts at `from`.
 */
export function placeTake(
  from: number,
  alignment: TakeAlignment | null,
  manualOffset: number,
): TakePlacement {
  if (!alignment) return { start: from, offset: 0 };
  const start =
    from +
    (alignment.recorderStartedAt - alignment.playbackStartedAt) -
    alignment.outputLatency -
    alignment.inputLatency -
    manualOffset;
  return start < 0 ? { start: 0, offset: -start } : { start, offset: 0 };
}
