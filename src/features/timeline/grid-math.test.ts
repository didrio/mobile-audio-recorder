import {
  gridSnapStep,
  gridSteps,
  LINE_BAR,
  LINE_BEAT,
  LINE_GROUP,
  lineKind,
  nearestGridLine,
} from './grid-math';

const meter = { bpm: 120, beatsPerBar: 4, beatUnit: 4 }; // bar = 2 s, beat = 0.5 s

describe('gridSteps', () => {
  it('shows every bar and fully faded-in beats when zoomed in', () => {
    // 100 pt/s: bar 200 pt, beat 50 pt.
    expect(gridSteps(meter, 100)).toEqual({ lineEvery: 1, labelEvery: 1, beatAlpha: 1 });
  });

  it('fades the beat lines out as the beats get close', () => {
    // 28 pt/s (the default zoom): beat 14 pt, halfway through the fade.
    const steps = gridSteps(meter, 28);
    expect(steps.beatAlpha).toBeGreaterThan(0);
    expect(steps.beatAlpha).toBeLessThan(1);
    expect(gridSteps(meter, 10).beatAlpha).toBe(0); // beat 5 pt
  });

  it('thins the bar lines and numbers when zoomed far out', () => {
    // 4 pt/s: bar 8 pt, so every 2nd bar line (16 pt) and every 8th number (64 pt).
    expect(gridSteps(meter, 4)).toEqual({ lineEvery: 2, labelEvery: 8, beatAlpha: 0 });
    // No beat lines once bar lines thin out, however wide the beats were.
    expect(gridSteps({ bpm: 240, beatsPerBar: 4, beatUnit: 4 }, 12).beatAlpha).toBe(0);
  });

  it('keeps numbers on bar lines that are drawn', () => {
    for (const zoom of [0.5, 1, 2, 4, 8, 16, 28, 100, 400]) {
      const steps = gridSteps(meter, zoom);
      expect(steps.labelEvery % steps.lineEvery).toBe(0);
    }
  });
});

describe('gridSnapStep', () => {
  it('snaps to beats while they are drawn, else to the visible bar lines', () => {
    expect(gridSnapStep(meter, 100)).toBe(0.5);
    expect(gridSnapStep(meter, 10)).toBe(2);
    expect(gridSnapStep(meter, 4)).toBe(4);
  });
});

describe('nearestGridLine', () => {
  it('returns the line within reach', () => {
    expect(nearestGridLine(1.02, 0.5, 0.1)).toBe(1);
    expect(nearestGridLine(1.3, 0.5, 0.1)).toBeNull();
  });

  it('never goes before 0:00 and ignores a missing grid', () => {
    expect(nearestGridLine(-0.05, 0.5, 0.1)).toBe(0);
    expect(nearestGridLine(1, 0, 0.1)).toBeNull();
  });
});

describe('lineKind', () => {
  it('marks bar lines and plain beats', () => {
    expect([0, 1, 2, 3, 4].map((beat) => lineKind(beat, 4, false))).toEqual([
      LINE_BAR,
      LINE_BEAT,
      LINE_BEAT,
      LINE_BEAT,
      LINE_BAR,
    ]);
  });

  it('groups the beats of compound meters in threes', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((beat) => lineKind(beat, 6, true))).toEqual([
      LINE_BAR,
      LINE_BEAT,
      LINE_BEAT,
      LINE_GROUP,
      LINE_BEAT,
      LINE_BEAT,
      LINE_BAR,
    ]);
  });
});
