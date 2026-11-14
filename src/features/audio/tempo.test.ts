import {
  addTap,
  barSeconds,
  beatSeconds,
  bpmFromTaps,
  clampBpm,
  isCompound,
  preRollLength,
  TAP_RESET_MS,
} from './tempo';

const fourFour = { bpm: 120, beatsPerBar: 4, beatUnit: 4 };

describe('meter', () => {
  it('measures beats and bars in seconds', () => {
    expect(beatSeconds(fourFour)).toBe(0.5);
    expect(barSeconds(fourFour)).toBe(2);
    // Eighth-note beats: 6 of them at 120 BPM.
    expect(barSeconds({ bpm: 120, beatsPerBar: 6, beatUnit: 8 })).toBe(3);
  });

  it('knows which meters are compound', () => {
    expect(isCompound(6, 8)).toBe(true);
    expect(isCompound(12, 8)).toBe(true);
    expect(isCompound(7, 8)).toBe(false);
    expect(isCompound(4, 4)).toBe(false);
    expect(isCompound(3, 4)).toBe(false);
  });

  it('clamps and rounds the tempo', () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(999)).toBe(240);
    expect(clampBpm(100.6)).toBe(101);
    expect(clampBpm(Number.NaN)).toBe(120);
  });
});

describe('preRollLength', () => {
  it('uses bars with the grid on and seconds without it', () => {
    const settings = { seconds: 2, bars: 1 };
    expect(preRollLength({ grid: true, meter: fourFour }, settings)).toBe(2);
    expect(preRollLength({ grid: true, meter: fourFour }, { seconds: 2, bars: 2 })).toBe(4);
    expect(preRollLength({ grid: false, meter: fourFour }, settings)).toBe(2);
    expect(
      preRollLength({ grid: true, meter: { bpm: 60, beatsPerBar: 3, beatUnit: 4 } }, settings),
    ).toBe(3);
  });
});

describe('tap tempo', () => {
  it('needs two taps', () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
  });

  it('averages the gaps', () => {
    expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
    expect(bpmFromTaps([0, 600, 1200])).toBe(100);
  });

  it('keeps tapping within the window and starts over after a pause', () => {
    let taps = addTap([], 0);
    taps = addTap(taps, 500);
    expect(taps).toEqual([0, 500]);
    taps = addTap(taps, 500 + TAP_RESET_MS + 1);
    expect(taps).toEqual([500 + TAP_RESET_MS + 1]);
  });

  it('only remembers the last few taps', () => {
    let taps: number[] = [];
    for (let i = 0; i < 12; i++) taps = addTap(taps, i * 500);
    expect(taps).toHaveLength(8);
    expect(taps[0]).toBe(4 * 500);
  });

  it('clamps to the allowed range', () => {
    expect(bpmFromTaps([0, 100])).toBe(240);
    expect(bpmFromTaps([0, 1900])).toBe(40);
  });
});
