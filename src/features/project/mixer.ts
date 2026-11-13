import type { Track } from '@/features/projects/projects-repo';

type MixerTrack = Pick<Track, 'volume' | 'muted' | 'solo'>;

/** Whether any track is soloed: then only soloed tracks are heard. */
export function hasSolo(tracks: Pick<Track, 'solo'>[]): boolean {
  return tracks.some((track) => track.solo);
}

/**
 * The gain a track plays at (what the engine's `setTrackGain` gets): its volume, or silence when it's
 * muted or another track is soloed. Solo wins over mute on the same track, as in most mixers.
 */
export function trackOutputGain(track: MixerTrack, anySolo: boolean): number {
  if (anySolo) return track.solo ? track.volume : 0;
  return track.muted ? 0 : track.volume;
}
