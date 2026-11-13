import { runOnUISync } from 'react-native-worklets';

import type { PlaybackAnchor } from '@/features/audio/audio-engine';

/**
 * Converts a playback anchor from the JS thread's `performance.now()` clock to the UI thread's,
 * where the playhead is animated. The two runtimes don't share a time origin (on iOS they were
 * ~29 hours apart: one counts from boot, the other from app start), so the offset is measured
 * with a synchronous call to the UI thread, centred between two JS readings.
 */
export function toUiClock(anchor: PlaybackAnchor): PlaybackAnchor {
  const before = performance.now();
  const ui = runOnUISync(() => {
    'worklet';
    return performance.now();
  });
  const after = performance.now();
  return { from: anchor.from, startedAtMs: anchor.startedAtMs + ui - (before + after) / 2 };
}
