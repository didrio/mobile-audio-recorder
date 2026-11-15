import {
  DECLICK_SECONDS,
  effectiveFades,
  envelopeAt,
  envelopePoints,
  seamlessEdges,
  type EnvelopeClip,
} from './clip-envelope';

const clip = (overrides: Partial<EnvelopeClip> = {}): EnvelopeClip => ({
  duration: 10,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  ...overrides,
});

describe('effectiveFades', () => {
  it('declicks every edge that has no fade', () => {
    expect(effectiveFades(clip())).toEqual({ fadeIn: DECLICK_SECONDS, fadeOut: DECLICK_SECONDS });
    expect(effectiveFades(clip({ fadeIn: 2 }))).toEqual({ fadeIn: 2, fadeOut: DECLICK_SECONDS });
  });

  it('skips the declick on seamless edges', () => {
    expect(effectiveFades(clip({ seamlessIn: true, seamlessOut: true }))).toEqual({
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it('scales both fades down when they would overlap in a short clip', () => {
    expect(effectiveFades(clip({ duration: 2, fadeIn: 3, fadeOut: 1 }))).toEqual({
      fadeIn: 1.5,
      fadeOut: 0.5,
    });
  });
});

describe('envelopeAt', () => {
  it('ramps in, holds the clip gain, ramps out', () => {
    const faded = clip({ gain: 0.5, fadeIn: 2, fadeOut: 4 });
    expect(envelopeAt(faded, 0)).toBe(0);
    expect(envelopeAt(faded, 1)).toBeCloseTo(0.25);
    expect(envelopeAt(faded, 5)).toBe(0.5);
    expect(envelopeAt(faded, 8)).toBeCloseTo(0.25);
    expect(envelopeAt(faded, 10)).toBe(0);
  });
});

describe('envelopePoints', () => {
  it('gives the corners of the whole clip', () => {
    expect(envelopePoints(clip({ gain: 2, fadeIn: 1, fadeOut: 2 }), 0, 10)).toEqual([
      { time: 0, value: 0 },
      { time: 1, value: 2 },
      { time: 8, value: 2 },
      { time: 10, value: 0 },
    ]);
  });

  it('starts mid-fade at the value there, with times from the piece start', () => {
    const points = envelopePoints(clip({ fadeIn: 4 }), 2, 3);
    expect(points).toEqual([
      { time: 0, value: 0.5 },
      { time: 2, value: 1 },
      { time: 3, value: 1 },
    ]);
  });

  it('is one point for a piece with nothing changing', () => {
    expect(envelopePoints(clip({ gain: 0.7 }), 2, 3)).toEqual([{ time: 0, value: 0.7 }]);
  });

  it('declicks the edges of a plain clip', () => {
    const points = envelopePoints(clip(), 0, 10);
    expect(points[0]).toEqual({ time: 0, value: 0 });
    expect(points[1]).toEqual({ time: DECLICK_SECONDS, value: 1 });
    expect(points.at(-1)).toEqual({ time: 10, value: 0 });
  });

  it('stops at the end of the clip even when asked for more (a loop tail)', () => {
    expect(envelopePoints(clip({ fadeOut: 2, seamlessIn: true }), 9, 5)).toEqual([
      { time: 0, value: 0.5 },
      { time: 1, value: 0 },
    ]);
  });
});

describe('seamlessEdges', () => {
  const piece = (start: number, offset: number, duration: number, overrides = {}) => ({
    trackId: 't1',
    takePath: 'take.wav',
    start,
    offset,
    duration,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
    ...overrides,
  });

  it('joins the two halves of a split clip', () => {
    const [head, tail] = seamlessEdges([piece(0, 0, 4), piece(4, 4, 6)]);
    expect(head).toMatchObject({ seamlessIn: false, seamlessOut: true });
    expect(tail).toMatchObject({ seamlessIn: true, seamlessOut: false });
  });

  it('does not join clips that jump in the take, change gain, fade, or sit on other tracks', () => {
    const cases = [
      [piece(0, 0, 4), piece(4, 5, 6)],
      [piece(0, 0, 4), piece(4, 4, 6, { gain: 0.5 })],
      [piece(0, 0, 4, { fadeOut: 0.5 }), piece(4, 4, 6)],
      [piece(0, 0, 4), piece(4, 4, 6, { trackId: 't2' })],
      [piece(0, 0, 4), piece(4, 4, 6, { takePath: 'other.wav' })],
    ];
    for (const clips of cases) {
      expect(seamlessEdges(clips).some((c) => c.seamlessIn || c.seamlessOut)).toBe(false);
    }
  });
});
