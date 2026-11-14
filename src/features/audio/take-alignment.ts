/**
 * Where a take recorded over other tracks belongs on the timeline, and the punch-in timing.
 *
 * The recorder can't be started at a time on the `AudioContext` clock, so the engine starts (or keeps)
 * the playback first, then the recorder, and measures (on the context clock):
 * - `playbackStartedAt`: when timeline position `playbackFrom` was sent to the output;
 * - `recorderStartedAt`: when the file's first sample was captured.
 *
 * A performer hears position `p` `outputLatency` after it's sent, and what they play reaches the
 * file `inputLatency` after it's captured, so the take lands late by both. `manualOffset` corrects
 * what the platform doesn't report (positive moves takes earlier).
 *
 * Punch in (pre-roll, and Record while playing): playback runs before the punch point, the recorder
 * starts as soon as it can, and the clip begins at the punch with `offset` skipping the file's run-up.
 * The punch can't be earlier than the file's first sample, so a recorder that starts late moves it.
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
  /** Seconds skipped at the beginning of the take (its run-up, or what fell before 0). */
  offset: number;
};

/**
 * Where playback starts for a pre-roll of `preRoll` seconds before `punch`. Not clamped: before 0:00
 * the run-up is silence (the engine schedules clips later), so it always lasts the full pre-roll.
 */
export function runUpStart(punch: number, preRoll: number): number {
  return punch - Math.max(0, preRoll);
}

/** The timeline position shown for playback position `time` (the run-up before 0:00 waits at 0). */
export function displayPosition(time: number): number {
  return Math.max(0, time);
}

/**
 * Timeline position of the file's first sample, for a recording made while playing from
 * `playbackFrom`. Without an alignment (nothing was playing) there's nothing to line up with: the
 * file starts at `playbackFrom`.
 */
export function fileStartPosition(
  playbackFrom: number,
  alignment: TakeAlignment | null,
  manualOffset: number,
): number {
  if (!alignment) return playbackFrom;
  return (
    playbackFrom +
    (alignment.recorderStartedAt - alignment.playbackStartedAt) -
    alignment.outputLatency -
    alignment.inputLatency -
    manualOffset
  );
}

/**
 * The punch point: the requested one, unless the file doesn't reach back that far yet, and never
 * sooner than `lead` after the current playback position (the cut has to be scheduled ahead).
 */
export function choosePunch(
  requested: number,
  fileStart: number,
  nowPosition: number,
  lead: number,
): number {
  return Math.max(requested, fileStart, nowPosition + lead);
}

/**
 * Clip placement for a take whose first sample sits at timeline position `fileStart`: it starts at
 * `fileStart`, but no earlier than `floor` (0, or the punch point), skipping the take's beginning to
 * get there. `null` when nothing is left after that (stopped before the punch: no take).
 */
export function placeTake(options: {
  fileStart: number;
  floor: number;
  takeDuration: number;
}): TakePlacement | null {
  const start = Math.max(options.fileStart, options.floor, 0);
  const offset = start - options.fileStart;
  return options.takeDuration - offset > MIN_TAKE_SECONDS ? { start, offset } : null;
}

/** Shorter than this after the punch counts as no take (a stop right at the punch point). */
const MIN_TAKE_SECONDS = 0.01;
