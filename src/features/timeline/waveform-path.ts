import { Skia, type SkPath } from '@shopify/react-native-skia';

import { peakCount, peaksPerSecond, type PeakLevels, type Peaks } from './waveform-peaks';

/**
 * Filled waveform outline of the window `offset…offset + duration` (seconds into the take): x in
 * clip-local seconds, y = -amplitude (so louder goes "up" before the canvas transform). The
 * timeline scales it by zoom and lane height, so paths only change when the clip does.
 */
export function buildWaveformPath(peaks: Peaks, offset: number, duration: number): SkPath {
  const rate = peaksPerSecond(peaks);
  const first = Math.max(0, Math.floor(offset * rate));
  const end = Math.min(peakCount(peaks), Math.ceil((offset + duration) * rate));
  const builder = Skia.PathBuilder.Make();
  if (end <= first) return builder.detach();
  const x = (index: number) => (index + 0.5) / rate - offset;

  builder.moveTo(x(first), -(peaks.data[first * 2 + 1] ?? 0));
  for (let index = first + 1; index < end; index++) {
    builder.lineTo(x(index), -(peaks.data[index * 2 + 1] ?? 0));
  }
  for (let index = end - 1; index >= first; index--) {
    builder.lineTo(x(index), -(peaks.data[index * 2] ?? 0));
  }
  builder.close();
  return builder.detach();
}

// Paths are cached per peak level and clip window, so re-renders don't rebuild them.
const cache = new WeakMap<Peaks, Map<string, SkPath>>();

/** One path per detail level (finest first) for a clip's window of its take. */
export function waveformPaths(levels: PeakLevels, offset: number, duration: number): SkPath[] {
  const key = `${offset}:${duration}`;
  return levels.map((peaks) => {
    let byWindow = cache.get(peaks);
    if (!byWindow) {
      byWindow = new Map();
      cache.set(peaks, byWindow);
    }
    let path = byWindow.get(key);
    if (!path) {
      path = buildWaveformPath(peaks, offset, duration);
      byWindow.set(key, path);
    }
    return path;
  });
}
