import type { EchoPlan } from '@/lib/echo-canceller';

import type { BackingPlayed } from './audio-engine';
import { clicksBetween, clickSamples, type ClickAccent } from './metronome';

/**
 * Speaker mode: the plan of what the speaker played during a take, placed in the recorded file, so
 * the echo canceller can rebuild that sound exactly and remove it (`@/lib/echo-canceller`).
 *
 * Positions are file-relative: the file's first sample is timeline position `fileStart`, taken from
 * `fileStartPosition` *without* the manual latency offset (that one corrects the performer's timing,
 * not where the speaker's sound lands in the file; the canceller also searches for the true delay).
 */
export function echoPlan(options: {
  backing: BackingPlayed;
  /** Timeline position of the file's first sample. */
  fileStart: number;
  /** Length of the recorded file, in seconds. */
  fileDuration: number;
  sampleRate: number;
  /** Absolute plain path of a take, from its stored relative path. */
  takeFile: (takePath: string) => string;
}): EchoPlan | null {
  const { backing, fileStart, fileDuration, sampleRate } = options;
  const fileEnd = fileStart + fileDuration;
  const cutAt = new Map(backing.cuts.map((cut) => [cut.trackId, cut.position]));

  const clips: EchoPlan['clips'] = [];
  for (const clip of backing.clips) {
    if (clip.gain <= 0) continue;
    // Heard from where the playback started, until the clip ends or its track was cut.
    const start = Math.max(clip.start, backing.from);
    const end = Math.min(clip.start + clip.duration, cutAt.get(clip.trackId) ?? Infinity, fileEnd);
    if (end <= start || end <= fileStart) continue;
    clips.push({
      path: options.takeFile(clip.takePath),
      gain: clip.gain,
      fileStart: start - fileStart,
      offset: clip.offset + (start - clip.start),
      duration: end - start,
    });
  }

  const clicks: EchoPlan['clicks'] = [];
  const waves: number[][] = [];
  const metronome = backing.metronome;
  if (metronome && metronome.volume > 0) {
    const waveIndex = new Map<ClickAccent, number>();
    // Clicks are scheduled from where the playback started; one that began just before the file
    // still rings into it.
    const from = Math.max(backing.from, fileStart - 0.1);
    for (const click of clicksBetween(metronome.meter, from, fileEnd)) {
      let wave = waveIndex.get(click.accent);
      if (wave === undefined) {
        wave = waves.length;
        waveIndex.set(click.accent, wave);
        waves.push(
          Array.from(clickSamples(click.accent, sampleRate), (sample) => sample * metronome.volume),
        );
      }
      clicks.push({ fileStart: click.position - fileStart, wave });
    }
  }

  return clips.length > 0 || clicks.length > 0 ? { clips, clicks, waves } : null;
}
