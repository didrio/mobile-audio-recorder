import type { BackingPlayed } from './audio-engine';
import { echoPlan } from './echo-reference';
import { clickSamples } from './metronome';

const clip = (overrides: Partial<BackingPlayed['clips'][number]> = {}) => ({
  takePath: 'takes/a.wav',
  trackId: 'track1',
  start: 0,
  offset: 0,
  duration: 10,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  trackGain: 1,
  ...overrides,
});

const plan = (backing: Partial<BackingPlayed>, fileStart = 2, fileDuration = 4) =>
  echoPlan({
    backing: { from: 0, clips: [], cuts: [], metronome: null, ...backing },
    fileStart,
    fileDuration,
    sampleRate: 48000,
    takeFile: (path) => `/abs/${path}`,
  });

describe('echoPlan', () => {
  it('places what played relative to the recorded file', () => {
    expect(
      plan({ clips: [clip({ start: 1, offset: 0.5, trackGain: 0.7, gain: 0.5 })] })?.clips,
    ).toEqual([
      // Plays from 1 on the timeline; the file starts at 2, so the window starts 1 s before it.
      // Gain is the clip gain times the track gain.
      { path: '/abs/takes/a.wav', gain: 0.35, fileStart: -1, offset: 0.5, duration: 5 },
    ]);
  });

  it('starts clips where the playback started (the run-up skips what came before)', () => {
    expect(plan({ from: 1.5, clips: [clip({ start: 0, offset: 0 })] })?.clips[0]).toMatchObject({
      fileStart: -0.5,
      offset: 1.5,
      duration: 4.5,
    });
  });

  it("stops a track's clips where it was cut (the punch)", () => {
    const result = plan({
      clips: [clip({ trackId: 'armed' }), clip({ trackId: 'other', takePath: 'takes/b.wav' })],
      cuts: [{ trackId: 'armed', position: 3 }],
    });
    expect(result?.clips.map((c) => [c.path, c.duration])).toEqual([
      ['/abs/takes/a.wav', 3],
      ['/abs/takes/b.wav', 6],
    ]);
  });

  it('leaves out silent tracks and clips outside the file', () => {
    expect(
      plan({
        clips: [
          clip({ trackGain: 0 }),
          clip({ gain: 0 }),
          clip({ start: 0, duration: 1 }), // ends before the file starts
          clip({ start: 7, duration: 2 }), // starts after it ends
        ],
      }),
    ).toBeNull();
  });

  it('adds the metronome clicks, one wave per accent at its volume', () => {
    const result = plan(
      { metronome: { meter: { bpm: 120, beatsPerBar: 4, beatUnit: 4 }, volume: 0.5 } },
      2,
      1.2,
    );
    // Beats every 0.5 s from the file start (2.0, a downbeat) to its end (3.2).
    expect(result?.clicks).toEqual([
      { fileStart: 0, wave: 0 },
      { fileStart: 0.5, wave: 1 },
      { fileStart: 1, wave: 1 },
    ]);
    expect(result?.waves).toHaveLength(2);
    const bar = clickSamples('bar', 48000);
    expect(result?.waves[0]?.[100]).toBeCloseTo((bar[100] ?? 0) * 0.5);
  });

  it('is null when nothing audible played', () => {
    expect(plan({})).toBeNull();
    expect(
      plan({ metronome: { meter: { bpm: 120, beatsPerBar: 4, beatUnit: 4 }, volume: 0 } }),
    ).toBeNull();
  });
});
