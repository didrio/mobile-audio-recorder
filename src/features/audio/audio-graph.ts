/**
 * Builds the playback graph on any Web Audio context: the live `AudioContext` that Play uses
 * (`audio-engine.ts`) and the `OfflineAudioContext` that Export renders with (`offline-render.ts`).
 * Both go through these functions, so an exported file can't drift from what Play sounds like.
 *
 * The graph: source → clip gain (the clip's envelope, `clip-envelope.ts`) → track gain → output.
 * Clicks: click buffer → the caller's click gain. Times are on the context's clock.
 */
import type {
  AudioBuffer,
  AudioBufferSourceNode,
  AudioNode,
  BaseAudioContext,
  GainNode,
} from 'react-native-audio-api';

import { envelopePoints, type EnvelopeClip } from './clip-envelope';
import { clickSamples, type ClickAccent } from './metronome';

/** What the graph needs of a clip: its place on the timeline and in its take, and its envelope. */
export type GraphClip = EnvelopeClip & {
  trackId: string;
  /** Timeline position, offset into the take, and length: all in seconds. */
  start: number;
  offset: number;
};

/** Where one clip starts in a straight (not looped) playback from timeline position `from`. */
export type ScheduledStart<T> = {
  clip: T;
  /** When it starts, in seconds after the playback's start. */
  at: number;
  /** How far into the clip it starts (playback began in the middle of it), and how much plays. */
  skipped: number;
  length: number;
  /** Where in the take it starts. */
  offset: number;
};

/**
 * The clips heard in a straight playback from `from`, each with when and where it starts. Clips
 * that end before `from` are left out; one that `from` falls in starts at once, part-way in.
 */
export function straightSchedule<T extends { start: number; offset: number; duration: number }>(
  clips: readonly T[],
  from: number,
): ScheduledStart<T>[] {
  return clips
    .filter((clip) => clip.start + clip.duration > from)
    .map((clip) => {
      const skipped = Math.max(0, from - clip.start);
      return {
        clip,
        at: Math.max(0, clip.start - from),
        skipped,
        length: clip.duration - skipped,
        offset: clip.offset + skipped,
      };
    });
}

/**
 * Starts every clip of a straight playback from timeline position `from`; timeline `from` sounds
 * at context time `startedAt`. `trackOutput` gives the node each clip's track plays into. Returns
 * the started sources and how long the playback lasts (seconds from `startedAt` to the last end).
 */
export function startClips<T extends GraphClip & { buffer: AudioBuffer | null }>(
  ctx: BaseAudioContext,
  clips: readonly T[],
  from: number,
  startedAt: number,
  trackOutput: (trackId: string) => AudioNode,
): { sources: AudioBufferSourceNode[]; end: number } {
  let end = 0;
  const sources = straightSchedule(clips, from).map(({ clip, at, skipped, length, offset }) => {
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    const when = startedAt + at;
    source.connect(connectClipGain(ctx, clip, skipped, length, when, trackOutput(clip.trackId)));
    source.start(when, offset, length);
    end = Math.max(end, clip.start + clip.duration - from);
    return source;
  });
  return { sources, end };
}

/**
 * The clip's own gain node (T16), connected to `output`: plays its envelope (`clip-envelope.ts`) for
 * `length` seconds from `from` seconds into the clip, starting at context time `at`.
 */
export function connectClipGain(
  ctx: BaseAudioContext,
  clip: EnvelopeClip,
  from: number,
  length: number,
  at: number,
  output: AudioNode,
): GainNode {
  const node = ctx.createGain();
  const [first, ...rest] = envelopePoints(clip, from, length);
  node.gain.value = first?.value ?? clip.gain;
  node.gain.setValueAtTime(node.gain.value, at);
  for (const point of rest) node.gain.linearRampToValueAtTime(point.value, at + point.time);
  node.connect(output);
  return node;
}

/** One gain per track, made on first use at `gain` (linear, 1 = 0 dB) and connected to `output`. */
export function trackGainNode(
  ctx: BaseAudioContext,
  tracks: Map<string, GainNode>,
  output: AudioNode,
  trackId: string,
  gain: number,
): GainNode {
  let node = tracks.get(trackId);
  if (!node) {
    node = ctx.createGain();
    node.gain.value = gain;
    node.connect(output);
    tracks.set(trackId, node);
  }
  return node;
}

/** Click sounds, made once per accent and sample rate. */
const clickBuffers = new Map<string, AudioBuffer>();

export function clickBuffer(ctx: BaseAudioContext, accent: ClickAccent): AudioBuffer {
  const key = `${accent}@${ctx.sampleRate}`;
  let buffer = clickBuffers.get(key);
  if (!buffer) {
    const samples = clickSamples(accent, ctx.sampleRate);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    clickBuffers.set(key, buffer);
  }
  return buffer;
}

/** Starts one metronome click at context time `at` into `output`. */
export function startClick(
  ctx: BaseAudioContext,
  accent: ClickAccent,
  at: number,
  output: AudioNode,
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = clickBuffer(ctx, accent);
  source.connect(output);
  source.start(at);
  return source;
}
