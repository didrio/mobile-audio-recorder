import { useQueries, type QueryClient } from '@tanstack/react-query';

import { decodeTake } from '@/features/audio/audio-engine';
import { peaksFile } from '@/features/audio/take-files';

import {
  computePeaks,
  decodePeaks,
  encodePeaks,
  peakLevels,
  type PeakLevels,
} from './waveform-peaks';

export const peaksKeys = {
  take: (takePath: string) => ['peaks', takePath] as const,
};

/**
 * Waveform peaks of a take: read from its `.peaks` file, or computed from the decoded audio the first
 * time (takes recorded before T2, or a missing/old file) and written for next time.
 */
export async function loadTakePeaks(takePath: string): Promise<PeakLevels> {
  const file = peaksFile(takePath);
  if (file.exists) {
    const cached = decodePeaks(await file.bytes());
    if (cached) return peakLevels(cached);
  }
  const buffer = await decodeTake(takePath);
  const peaks = computePeaks(buffer.getChannelData(0), buffer.sampleRate);
  try {
    await file.write(encodePeaks(peaks));
  } catch {
    // Not fatal: the peaks are recomputed next time.
  }
  return peakLevels(peaks);
}

const peaksQuery = (takePath: string) => ({
  queryKey: peaksKeys.take(takePath),
  queryFn: () => loadTakePeaks(takePath),
  // Takes never change, so neither do their peaks.
  staleTime: Infinity,
});

/** Peaks per take path; entries are missing while loading or if a take couldn't be read. */
export function useTakePeaks(takePaths: string[]): Record<string, PeakLevels> {
  return useQueries({
    queries: takePaths.map(peaksQuery),
    combine: (results) => {
      const byPath: Record<string, PeakLevels> = {};
      results.forEach((result, index) => {
        const path = takePaths[index];
        if (result.data && path) byPath[path] = result.data;
      });
      return byPath;
    },
  });
}

/** Compute and cache a new take's peaks right after recording, before the timeline asks. */
export function prefetchTakePeaks(queryClient: QueryClient, takePath: string): Promise<void> {
  return queryClient.prefetchQuery(peaksQuery(takePath));
}
