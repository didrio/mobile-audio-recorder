/**
 * Waveform overviews ("peaks"): the min and max sample of every block of `samplesPerPeak` samples.
 * Computed once per take from the decoded audio and cached next to the WAV as `<takeId>.peaks`
 * (see `use-take-peaks.ts`), so the timeline never touches raw audio while drawing.
 *
 * File format: a Float32 header `[version, sampleRate, samplesPerPeak, peakCount]`, then
 * `peakCount` interleaved `[min, max]` pairs.
 */

export const SAMPLES_PER_PEAK = 256;
/** Each coarser level merges this many peaks of the level below. */
export const LEVEL_FACTOR = 4;
/** Finest level plus three coarser ones (×4, ×16, ×64) for zoomed-out views. */
export const LEVEL_COUNT = 4;

const FORMAT_VERSION = 1;
const HEADER_LENGTH = 4;

export type Peaks = {
  /** Sample rate of the audio the peaks were computed from. */
  sampleRate: number;
  samplesPerPeak: number;
  /** Interleaved `[min, max]` per block, values in -1…1. */
  data: Float32Array;
};

/** Detail levels, finest first. */
export type PeakLevels = Peaks[];

export function peakCount(peaks: Peaks): number {
  return peaks.data.length / 2;
}

export function peaksPerSecond(peaks: Peaks): number {
  return peaks.sampleRate / peaks.samplesPerPeak;
}

export function computePeaks(
  samples: ArrayLike<number>,
  sampleRate: number,
  samplesPerPeak = SAMPLES_PER_PEAK,
): Peaks {
  const count = Math.ceil(samples.length / samplesPerPeak);
  const data = new Float32Array(count * 2);
  for (let peak = 0; peak < count; peak++) {
    const from = peak * samplesPerPeak;
    const to = Math.min(from + samplesPerPeak, samples.length);
    let min = 0;
    let max = 0;
    for (let i = from; i < to; i++) {
      const value = samples[i] ?? 0;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    data[peak * 2] = Math.max(-1, min);
    data[peak * 2 + 1] = Math.min(1, max);
  }
  return { sampleRate, samplesPerPeak, data };
}

/** Merges every `factor` peaks into one (min of mins, max of maxes). */
export function downsamplePeaks(peaks: Peaks, factor: number): Peaks {
  const source = peaks.data;
  const sourceCount = source.length / 2;
  const count = Math.ceil(sourceCount / factor);
  const data = new Float32Array(count * 2);
  for (let peak = 0; peak < count; peak++) {
    let min = 0;
    let max = 0;
    const end = Math.min((peak + 1) * factor, sourceCount);
    for (let i = peak * factor; i < end; i++) {
      min = Math.min(min, source[i * 2] ?? 0);
      max = Math.max(max, source[i * 2 + 1] ?? 0);
    }
    data[peak * 2] = min;
    data[peak * 2 + 1] = max;
  }
  return { sampleRate: peaks.sampleRate, samplesPerPeak: peaks.samplesPerPeak * factor, data };
}

export function peakLevels(peaks: Peaks): PeakLevels {
  const levels = [peaks];
  for (let level = 1; level < LEVEL_COUNT; level++) {
    levels.push(downsamplePeaks(levels[level - 1] as Peaks, LEVEL_FACTOR));
  }
  return levels;
}

export function encodePeaks(peaks: Peaks): Uint8Array {
  const out = new Float32Array(HEADER_LENGTH + peaks.data.length);
  out.set([FORMAT_VERSION, peaks.sampleRate, peaks.samplesPerPeak, peakCount(peaks)]);
  out.set(peaks.data, HEADER_LENGTH);
  return new Uint8Array(out.buffer);
}

/** Returns `null` for files from another format version or truncated files (recompute them). */
export function decodePeaks(bytes: Uint8Array): Peaks | null {
  if (bytes.byteLength < HEADER_LENGTH * 4 || bytes.byteLength % 4 !== 0) return null;
  // Copy: the bytes may not be 4-byte aligned in their buffer.
  const floats = new Float32Array(bytes.slice().buffer);
  const [version, sampleRate, samplesPerPeak, count] = floats;
  if (version !== FORMAT_VERSION || !sampleRate || !samplesPerPeak || count == null) return null;
  if (floats.length !== HEADER_LENGTH + count * 2) return null;
  return { sampleRate, samplesPerPeak, data: floats.slice(HEADER_LENGTH) };
}
