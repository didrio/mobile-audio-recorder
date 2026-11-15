import { play, stopPlayback, type PlayableClip } from './audio-engine';
import * as graph from './audio-graph';
import { createTakeCache, renderOffline } from './offline-render';

const clip = (changes: Partial<PlayableClip>): PlayableClip => ({
  takePath: 'projects/p/takes/a.wav',
  trackId: 't1',
  start: 0,
  offset: 0,
  duration: 4,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  ...changes,
});

/** What `startClips` was asked to schedule, without the decoded buffers. */
function scheduled(spy: jest.SpyInstance) {
  const [, clips, from] = spy.mock.calls.at(-1)! as Parameters<typeof graph.startClips>;
  return {
    from,
    clips: clips.map(({ buffer: _buffer, ...rest }) => {
      const { trackGain: _gain, ...withoutGain } = rest as typeof rest & { trackGain?: number };
      return withoutGain;
    }),
  };
}

describe('straightSchedule', () => {
  it('starts each heard clip at its place after `from`, part-way into one already sounding', () => {
    const clips = [
      clip({ start: 0, duration: 2 }), // over before 3 s
      clip({ start: 2, offset: 1, duration: 4 }), // sounding at 3 s
      clip({ start: 5, duration: 1 }),
    ];
    expect(graph.straightSchedule(clips, 3)).toEqual([
      { clip: clips[1], at: 0, skipped: 1, length: 3, offset: 2 },
      { clip: clips[2], at: 2, skipped: 0, length: 1, offset: 0 },
    ]);
  });
});

describe('renderOffline', () => {
  afterEach(() => {
    stopPlayback();
    jest.restoreAllMocks();
  });

  // A split take (seamless joint), a faded clip on another track, and one that ends before the range.
  const clips = [
    clip({ start: 0, duration: 2 }),
    clip({ start: 2, offset: 2, duration: 3 }),
    clip({ trackId: 't2', takePath: 'projects/p/takes/b.wav', start: 1, duration: 6, fadeIn: 0.5 }),
    clip({ start: 7, duration: 1, gain: 0.5 }),
  ];

  it('schedules the clips exactly as Play does from the range start', async () => {
    const spy = jest.spyOn(graph, 'startClips');

    await play(clips, { from: 1.5 });
    const playback = scheduled(spy);

    await renderOffline({
      clips: clips.map((c) => ({ ...c, trackGain: 1 })),
      click: null,
      range: { start: 1.5, end: 8 },
      takes: createTakeCache(48000),
    });
    const exported = scheduled(spy);

    expect(exported.from).toBe(1.5);
    expect(exported).toEqual(playback);
    // The seamless joint is kept (no declick between the two pieces of the take).
    expect(exported.clips[0]).toMatchObject({ seamlessOut: true });
    expect(exported.clips[1]).toMatchObject({ seamlessIn: true });
  });

  it('renders the range’s length at the export sample rate, with the track gains given', async () => {
    const trackGain = jest.spyOn(graph, 'trackGainNode');
    const samples = await renderOffline({
      clips: [{ ...clips[2]!, trackGain: 0.25 }],
      click: null,
      range: { start: 2, end: 4.5 },
      takes: createTakeCache(44100),
    });
    expect(samples).toHaveLength(2.5 * 44100);
    expect(trackGain).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Map),
      expect.anything(),
      't2',
      0.25,
    );
  });

  it('places metronome clicks on the beat grid from the range start', async () => {
    const click = jest.spyOn(graph, 'startClick');
    await renderOffline({
      clips: [],
      click: { meter: { bpm: 120, beatsPerBar: 4, beatUnit: 4 }, volume: 0.8 },
      range: { start: 1.25, end: 3 },
      takes: createTakeCache(48000),
    });
    // Beats at 1.5, 2 (bar), 2.5 s → 0.25, 0.75, 1.25 s into the file.
    expect(click.mock.calls.map(([, accent, at]) => [accent, at])).toEqual([
      ['beat', 0.25],
      ['bar', 0.75],
      ['beat', 1.25],
    ]);
  });
});
