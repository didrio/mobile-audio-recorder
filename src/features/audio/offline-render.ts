/**
 * Offline rendering for Export (T36, T37): plays clips (and optionally the metronome) into an
 * `OfflineAudioContext` as fast as the device can, and returns the mono samples.
 *
 * It builds the graph with the same code as Play (`audio-graph.ts`): the clips go through
 * `seamlessEdges` and `startClips` exactly as in `audio-engine.ts`'s `play()` from the range start,
 * with the track gains given (the export decides them: the mixer's for a mix, the stem options for
 * stems). Clicks are placed by `clicksBetween` like the live scheduler. So the file sounds like
 * pressing Play at the range start.
 *
 * Takes are decoded at the export's sample rate, once per export (`createTakeCache`).
 */
import { decodeAudioData, OfflineAudioContext, type AudioBuffer } from 'react-native-audio-api';

import type { PlayableClip } from './audio-engine';
import { startClick, startClips, trackGainNode } from './audio-graph';
import { seamlessEdges } from './clip-envelope';
import { clicksBetween } from './metronome';
import { takeFilePath } from './take-files';
import type { Meter } from './tempo';

/** Short fade where the range cuts into sounding audio, so a section export doesn't click. */
export const RANGE_EDGE_FADE_SECONDS = 0.005;

/** Decoded takes for one export, keyed by take path. */
export type TakeCache = { sampleRate: number; takes: Map<string, Promise<AudioBuffer>> };

export function createTakeCache(sampleRate: number): TakeCache {
  return { sampleRate, takes: new Map() };
}

function decode(cache: TakeCache, takePath: string): Promise<AudioBuffer> {
  let buffer = cache.takes.get(takePath);
  if (!buffer) {
    buffer = decodeAudioData(takeFilePath(takePath), cache.sampleRate);
    cache.takes.set(takePath, buffer);
  }
  return buffer;
}

export type OfflineRenderRequest = {
  /** The clips, each with the gain its track plays at in this file. */
  clips: (PlayableClip & { trackGain: number })[];
  /** The metronome to mix in (`null`: none). */
  click: { meter: Meter; volume: number } | null;
  /** The timeline span to render, in seconds. */
  range: { start: number; end: number };
  takes: TakeCache;
};

/** Renders the request to mono samples at the cache's sample rate (`(end − start) × rate` frames). */
export async function renderOffline(request: OfflineRenderRequest): Promise<Float32Array> {
  const { range, takes } = request;
  const sampleRate = takes.sampleRate;
  const length = Math.max(1, Math.round((range.end - range.start) * sampleRate));
  const duration = length / sampleRate;

  const clips = seamlessEdges(request.clips).filter(
    (clip) => clip.start < range.end && clip.start + clip.duration > range.start,
  );
  const buffers = await Promise.all(clips.map((clip) => decode(takes, clip.takePath)));

  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
  const master = ctx.createGain();
  master.connect(ctx.destination);
  // Fade in/out only where the range cuts through a clip (the whole idea starts and ends clean).
  const cutAtStart = clips.some((clip) => clip.start < range.start - 1e-6);
  const cutAtEnd = clips.some((clip) => clip.start + clip.duration > range.end + 1e-6);
  const edge = Math.min(RANGE_EDGE_FADE_SECONDS, duration / 2);
  master.gain.value = cutAtStart ? 0 : 1;
  master.gain.setValueAtTime(master.gain.value, 0);
  if (cutAtStart) master.gain.linearRampToValueAtTime(1, edge);
  if (cutAtEnd) {
    master.gain.setValueAtTime(1, duration - edge);
    master.gain.linearRampToValueAtTime(0, duration);
  }

  const trackGains = new Map(clips.map((clip) => [clip.trackId, clip.trackGain]));
  const tracks = new Map();
  startClips(
    ctx,
    clips.map((clip, index) => ({ ...clip, buffer: buffers[index] ?? null })),
    range.start,
    0,
    (trackId) => trackGainNode(ctx, tracks, master, trackId, trackGains.get(trackId) ?? 1),
  );

  if (request.click) {
    const clickGain = ctx.createGain();
    clickGain.gain.value = request.click.volume;
    clickGain.connect(master);
    for (const click of clicksBetween(request.click.meter, range.start, range.end)) {
      startClick(ctx, click.accent, click.position - range.start, clickGain);
    }
  }

  const rendered = await ctx.startRendering();
  // A copy: the rendered buffer's memory belongs to the native side.
  const samples = new Float32Array(length);
  const channel = rendered.getChannelData(0);
  samples.set(channel.length > length ? channel.subarray(0, length) : channel);
  return samples;
}
