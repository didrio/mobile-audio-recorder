import {
  computePeaks,
  createLivePeaks,
  decodePeaks,
  downsamplePeaks,
  maxAmplitude,
  encodePeaks,
  LEVEL_COUNT,
  peakCount,
  peakLevels,
  peaksPerSecond,
} from './waveform-peaks';

describe('computePeaks', () => {
  it('keeps the min and max of each block, including a partial last block', () => {
    const samples = [0.1, -0.5, 0.3, 0.9, -0.2, 0.4, -0.8];
    const peaks = computePeaks(samples, 48000, 3);
    expect(peakCount(peaks)).toBe(3);
    expect(Array.from(peaks.data)).toEqual([
      expect.closeTo(-0.5),
      expect.closeTo(0.3),
      expect.closeTo(-0.2),
      expect.closeTo(0.9),
      expect.closeTo(-0.8),
      0,
    ]);
    expect(peaksPerSecond(peaks)).toBe(16000);
  });

  it('clamps values to -1…1', () => {
    const peaks = computePeaks([2, -3], 100, 2);
    expect(Array.from(peaks.data)).toEqual([-1, 1]);
  });
});

describe('downsamplePeaks and peakLevels', () => {
  it('merges peaks into coarser levels', () => {
    const peaks = computePeaks([0.1, -0.2, 0.5, -0.9, 0.3], 1000, 1);
    const coarse = downsamplePeaks(peaks, 2);
    expect(coarse.samplesPerPeak).toBe(2);
    expect(Array.from(coarse.data)).toEqual([
      expect.closeTo(-0.2),
      expect.closeTo(0.1),
      expect.closeTo(-0.9),
      expect.closeTo(0.5),
      0,
      expect.closeTo(0.3),
    ]);
  });

  it('builds the configured number of levels', () => {
    const levels = peakLevels(computePeaks(new Float32Array(10_000), 48000));
    expect(levels).toHaveLength(LEVEL_COUNT);
    expect(levels.map((level) => level.samplesPerPeak)).toEqual([256, 1024, 4096, 16384]);
  });
});

describe('encodePeaks / decodePeaks', () => {
  it('round-trips', () => {
    const peaks = computePeaks([0.25, -0.5, 0.75, -1], 44100, 2);
    const decoded = decodePeaks(encodePeaks(peaks));
    expect(decoded).toEqual(peaks);
  });

  it('rejects truncated or foreign data', () => {
    const bytes = encodePeaks(computePeaks([0.25, -0.5, 0.75, -1], 44100, 2));
    expect(decodePeaks(bytes.slice(0, bytes.length - 4))).toBeNull();
    expect(decodePeaks(new Uint8Array(3))).toBeNull();
    const wrongVersion = new Float32Array(bytes.slice().buffer);
    wrongVersion[0] = 99;
    expect(decodePeaks(new Uint8Array(wrongVersion.buffer))).toBeNull();
  });
});

describe('createLivePeaks', () => {
  it('emits pairs at a fixed rate across buffers of any size', () => {
    const live = createLivePeaks(1000); // 48 samples per peak at 48 kHz
    const first = live.push(new Array(70).fill(0.5), 48000);
    expect(first).toEqual([0, 0.5]);
    const second = live.push([-0.25, ...new Array(25).fill(0)], 48000);
    expect(second).toEqual([-0.25, 0.5]); // the carried 22 samples + 26 new ones
  });
});

describe('maxAmplitude', () => {
  it('is the loudest sample on either side of zero', () => {
    const peaks = computePeaks([0.1, -0.6, 0.3, 0.5], 4, 2);
    expect(maxAmplitude(peaks)).toBeCloseTo(0.6);
    expect(maxAmplitude(undefined)).toBe(0);
  });
});
