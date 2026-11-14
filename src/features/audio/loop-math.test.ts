import {
  clipPieces,
  defaultLoopRegion,
  dragLoopEdge,
  LOOP_EDGE_END,
  LOOP_EDGE_START,
  LOOP_FADE_SECONDS,
  loopedPosition,
  loopSegments,
  loopStartPosition,
} from './loop-math';

const region = { start: 2, end: 6 };
const meter = { bpm: 120, beatsPerBar: 4, beatUnit: 4 }; // 2 s bars

describe('loopStartPosition', () => {
  it('keeps a playhead inside the region and moves one outside to the start', () => {
    expect(loopStartPosition(3, region)).toBe(3);
    expect(loopStartPosition(2, region)).toBe(2);
    expect(loopStartPosition(6, region)).toBe(2);
    expect(loopStartPosition(1, region)).toBe(2);
    expect(loopStartPosition(10, region)).toBe(2);
  });
});

describe('loopedPosition', () => {
  it('is linear without a loop', () => {
    expect(loopedPosition(1, null, 7.5)).toBe(8.5);
  });

  it('plays to the end once, then wraps to the start', () => {
    expect(loopedPosition(3, region, 0)).toBe(3);
    expect(loopedPosition(3, region, 2.5)).toBe(5.5);
    expect(loopedPosition(3, region, 3)).toBe(2);
    expect(loopedPosition(3, region, 4)).toBe(3);
    expect(loopedPosition(3, region, 7)).toBe(2);
  });

  it('stays exact after many passes', () => {
    expect(loopedPosition(2, region, 4 * 1000 + 1.25)).toBeCloseTo(3.25, 9);
  });

  it('treats an empty region as no loop', () => {
    expect(loopedPosition(1, { start: 4, end: 4 }, 5)).toBe(6);
  });
});

describe('loopSegments', () => {
  it('is one endless pass without a loop', () => {
    expect(loopSegments(5, null, 10, 11)).toEqual([
      { index: 0, elapsed: 0, start: 5, end: Infinity },
    ]);
  });

  it('starts with the partial first pass, then whole passes', () => {
    expect(loopSegments(5, region, 0, 6)).toEqual([
      { index: 0, elapsed: 0, start: 5, end: 6 },
      { index: 1, elapsed: 1, start: 2, end: 6 },
      { index: 2, elapsed: 5, start: 2, end: 6 },
    ]);
  });

  it('returns only the passes overlapping the window', () => {
    expect(loopSegments(5, region, 1, 4.9)).toEqual([{ index: 1, elapsed: 1, start: 2, end: 6 }]);
    expect(loopSegments(5, region, 5, 5.2)).toEqual([{ index: 2, elapsed: 5, start: 2, end: 6 }]);
  });

  it('places pass k exactly, however far in', () => {
    const [segment] = loopSegments(2, region, 4000, 4000.1);
    expect(segment).toEqual({ index: 1000, elapsed: 4000, start: 2, end: 6 });
  });

  it('returns nothing for an empty window', () => {
    expect(loopSegments(2, region, 3, 3)).toEqual([]);
  });
});

describe('clipPieces', () => {
  const clip = (start: number, duration: number, offset = 0) => ({ start, offset, duration });

  it('plays a clip inside the region whole, without fades', () => {
    const [piece] = clipPieces([clip(3, 1, 0.5)], { index: 1, elapsed: 10, start: 2, end: 6 });
    expect(piece).toMatchObject({ at: 11, offset: 0.5, duration: 1, fadeIn: 0, fadeOut: 0 });
  });

  it('fades a clip cut at the loop start in, on wraps only', () => {
    const across = clip(1, 2);
    const [wrap] = clipPieces([across], { index: 1, elapsed: 10, start: 2, end: 6 });
    expect(wrap).toMatchObject({ at: 10, offset: 1, duration: 1, fadeIn: LOOP_FADE_SECONDS });
    const [first] = clipPieces([across], { index: 0, elapsed: 0, start: 2, end: 6 });
    expect(first?.fadeIn).toBe(0);
  });

  it('lets a clip cut at the loop end ring on briefly while fading out', () => {
    const [piece] = clipPieces([clip(5, 3)], { index: 1, elapsed: 10, start: 2, end: 6 });
    expect(piece).toMatchObject({
      at: 13,
      offset: 0,
      duration: 1 + LOOP_FADE_SECONDS,
      fadeOut: LOOP_FADE_SECONDS,
      fadeOutAt: 14,
    });
  });

  it('cuts and fades both ends of a clip longer than the region', () => {
    const [piece] = clipPieces([clip(0, 10, 1)], { index: 2, elapsed: 20, start: 2, end: 6 });
    expect(piece).toMatchObject({
      at: 20,
      offset: 3,
      duration: 4 + LOOP_FADE_SECONDS,
      fadeIn: LOOP_FADE_SECONDS,
      fadeOut: LOOP_FADE_SECONDS,
    });
  });

  it('skips clips outside the pass, and the part before where playback started', () => {
    const pieces = clipPieces([clip(0, 2), clip(6, 1), clip(3, 2)], {
      index: 0,
      elapsed: 0,
      start: 4,
      end: 6,
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ at: 0, offset: 1, duration: 1, fadeIn: 0, fadeOut: 0 });
  });

  it('never fades without a loop', () => {
    const [piece] = clipPieces([clip(0, 5)], { index: 0, elapsed: 0, start: 1, end: Infinity });
    expect(piece).toMatchObject({ at: 0, offset: 1, duration: 4, fadeIn: 0, fadeOut: 0 });
  });
});

describe('defaultLoopRegion', () => {
  it('is 8 s from the playhead without the grid', () => {
    expect(defaultLoopRegion(3.3, { grid: false, meter })).toEqual({ start: 3.3, end: 11.3 });
  });

  it('is two bars from the playhead’s bar with the grid on', () => {
    expect(defaultLoopRegion(5.1, { grid: true, meter })).toEqual({ start: 4, end: 8 });
    expect(defaultLoopRegion(4, { grid: true, meter })).toEqual({ start: 4, end: 8 });
  });
});

describe('dragLoopEdge', () => {
  const free = { step: 0, minLength: 1 };
  const bars = { step: 2, minLength: 2 };

  it('moves an edge freely without a step', () => {
    expect(dragLoopEdge(region, LOOP_EDGE_START, 2.7, free)).toEqual({ start: 2.7, end: 6 });
    expect(dragLoopEdge(region, LOOP_EDGE_END, 9.1, free)).toEqual({ start: 2, end: 9.1 });
  });

  it('rounds to the step (bars)', () => {
    expect(dragLoopEdge(region, LOOP_EDGE_END, 8.9, bars)).toEqual({ start: 2, end: 8 });
    expect(dragLoopEdge(region, LOOP_EDGE_START, 0.9, bars)).toEqual({ start: 0, end: 6 });
  });

  it('keeps the minimum length and never crosses the other edge', () => {
    expect(dragLoopEdge(region, LOOP_EDGE_START, 7, free)).toEqual({ start: 5, end: 6 });
    expect(dragLoopEdge(region, LOOP_EDGE_END, 0, bars)).toEqual({ start: 2, end: 4 });
  });

  it('never goes before 0:00', () => {
    expect(dragLoopEdge(region, LOOP_EDGE_START, -3, free)).toEqual({ start: 0, end: 6 });
  });
});
