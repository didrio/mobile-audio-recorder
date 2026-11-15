/**
 * The app's audio engine: the only module that talks to `react-native-audio-api` (Web Audio API).
 * Features and tests use these functions, never the library directly.
 *
 * - Recording: `AudioRecorder` writes a lossless mono WAV to the cache; the caller moves it into the
 *   project (see `take-files.ts`). `onBuffer` gets every input buffer (level meter, live waveform).
 * - Metering: `setMetering` opens the mic without a file while a track is armed (the input meter) and
 *   closes it again; only permission already granted is used, the prompt comes with the first Record.
 * - Overdubs: recording plays clips from a timeline position (or keeps the playback that's already
 *   running: Record while playing). The recorder can't be started at a context time, so playback
 *   starts first, then the recorder, and the engine measures where the file's first sample sits on
 *   the context clock (`ctx.currentTime − recorder.getCurrentDuration()`, sampled for a second,
 *   keeping the minimum because the duration lags by up to one callback). `whenStarted()` gives the
 *   first measurement (an upper bound, enough to pick a punch point), `stop()` the final one with the
 *   latencies; `take-alignment.ts` turns it into a clip.
 * - Punch in: `cutTrackAt` silences a playing track from a timeline position on (a short fade on its
 *   gain, sample-accurate on the context clock), so the armed track plays through the run-up and goes
 *   quiet exactly where the new take starts. Later gain changes leave a cut track silent.
 * - Playback: one shared `AudioContext`. Every clip becomes an `AudioBufferSourceNode` started at
 *   its timeline position: source → clip gain → track gain → master gain → speakers. Decoded takes are
 *   cached. The clip gain node plays the clip's envelope (T16, `clip-envelope.ts`): its gain, fades, and
 *   a few-millisecond declick on every edge, except where a split left two pieces of a take back to back.
 * - Mixer: `setTrackGain` keeps each track's gain (track volume; later × mute/solo). Playback builds
 *   one `GainNode` per track from it, and changes apply live (short ramp) to the playing graph,
 *   including the backing playback while recording.
 * - Metronome: `setMetronome` sets (or clears) the click's meter and volume, live. Every playback
 *   runs a small lookahead scheduler that starts click buffers (`metronome.ts`) on the context clock
 *   at their timeline positions, exactly like clips, so the click lines up with the backing and,
 *   after latency compensation, with takes. The run-up before 0:00 clicks too (the count-in).
 *   Clicks skip the track gains (mute, solo and volume never touch them).
 *   Recording keeps its playback running until Stop (`endless`), so the click doesn't stop after the
 *   last clip, and with the metronome on there is a playback even when no clip is audible.
 * - Silent recording (T34): `silenceOutput` fades the whole output (master gain: clips and clicks)
 *   to silence between two timeline positions, sample-accurate on the context clock, so nothing from
 *   the speaker reaches a take that starts after it. A recording playback can also start `silent`
 *   (master at 0): it still runs, so alignment and the playhead work as usual. Gain and metronome
 *   changes don't touch the master, and the next `play()` builds a new one, so playback after Stop is
 *   normal again.
 * - Speaker mode (T21): `stop()` also says what the backing played (`BackingPlayed`: the clips at
 *   their track gains, where a track was cut, the metronome), so the take can be cleaned of it
 *   afterwards (`echo-reference.ts`, `@/lib/echo-canceller`).
 * - Loop (T26): `play(…, { loop })` repeats a region gaplessly. Clips are rescheduled every pass
 *   (a buffer source's own `loop` only loops one buffer), a pass about a second before it sounds,
 *   on the context clock, by the same scheduler tick as the clicks (`loop-math.ts` maps elapsed time
 *   to passes and clip pieces). Where the loop cuts a clip, the tail rings on a few milliseconds
 *   fading out while the head fades in (a per-piece gain), so the wrap doesn't click. A looped
 *   playback never ends by itself. Recording never loops.
 * - Pitch reference keyboard (T20): `startNote` / `stopNote` play a synthesized tone (a few sine
 *   partials, attack/decay/release envelope) on the same context, straight to the speakers through
 *   their own bus: never through a playback's master (so silent recording, Stop and Play don't touch
 *   them), never into a take except through the mic. `prepareKeyboard` readies the session up front.
 * - Playhead: `playbackAnchor()` gives the moment (on the `performance.now()` clock, shared by the
 *   JS and UI threads) when timeline position `from` is heard, so the UI can animate the playhead
 *   per frame without calling into the engine.
 *
 * Needs a development build (not in Expo Go). Native config: the `react-native-audio-api` plugin in
 * `app.json` (microphone permission, background audio, Android foreground service).
 */
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  FileDirectory,
  FileFormat,
  FilePreset,
  type AudioBuffer,
  type AudioBufferSourceNode,
  type GainNode,
  type OscillatorNode,
  type PeriodicWave,
} from 'react-native-audio-api';

import { envelopePoints, seamlessEdges } from './clip-envelope';
import { clipPieces, loopedPosition, loopSegments, type LoopRegion } from './loop-math';
import { clicksBetween, clickSamples, type ClickAccent } from './metronome';
import type { TakeAlignment } from './take-alignment';
import { takeFilePath } from './take-files';
import type { Meter } from './tempo';

const RECORDING_PRESET = FilePreset.Lossless;
const RECORDING_CHANNELS = 1;
/** Small lead time so every source is scheduled before the first one has to sound. */
const SCHEDULE_AHEAD_SECONDS = 0.05;
/** How long and how often the recorder's start is measured against the context clock. */
const ALIGN_SAMPLE_MS = 20;
const ALIGN_WINDOW_MS = 1000;

export type RecordedTake = {
  /** Absolute path of the recorded file (in the cache, to be moved by the caller). */
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
};

export type FinishedRecording = RecordedTake & {
  /** Measured start against the backing playback; `null` when nothing was playing. */
  alignment: TakeAlignment | null;
  /** What the backing played while recording; `null` when nothing was playing. */
  backing: BackingPlayed | null;
};

/** What a playback sent to the speaker, for removing it from a take recorded over it. */
export type BackingPlayed = {
  /** Timeline position the playback started from (nothing before it was heard). */
  from: number;
  /** The clips it scheduled, each with its track's gain when the playback started. */
  clips: (PlayableClip & { trackGain: number })[];
  /** Tracks silenced from a timeline position on (`cutTrackAt`, the punch). */
  cuts: { trackId: string; position: number }[];
  /** The metronome when the recording stopped (`null`: off). */
  metronome: MetronomeConfig | null;
};

export type ActiveRecording = {
  /** Playhead anchor: when timeline position `anchor.from` (where playback started) is heard. */
  anchor: PlaybackAnchor;
  /**
   * The first measurement of where the file starts (`recorderStartedAt` is an upper bound until
   * `stop()` refines it); `null` when nothing is playing to measure against.
   */
  whenStarted(): Promise<TakeAlignment | null>;
  stop(): Promise<FinishedRecording>;
};

/** What plays while recording: clips from a timeline position, or the playback already running. */
export type RecordingPlayback =
  | {
      clips: PlayableClip[];
      from: number;
      /** Runs muted from the start (silent recording without a run-up). */
      silent?: boolean;
    }
  | { continueFrom: number };

export type PlayableClip = {
  /** Take path relative to the document directory (as stored in the database). */
  takePath: string;
  /** Its track: the clip plays through that track's gain (`setTrackGain`). */
  trackId: string;
  /** Timeline position, offset into the take, and length: all in seconds. */
  start: number;
  offset: number;
  duration: number;
  /** Clip gain (linear) and fade lengths in seconds (T16). */
  gain: number;
  fadeIn: number;
  fadeOut: number;
};

/** A clip as scheduled: with the edges it shares seamlessly with a neighbor (no declick there). */
type ScheduledClip = PlayableClip & { seamlessIn: boolean; seamlessOut: boolean };

let context: AudioContext | null = null;
let recorder: AudioRecorder | null = null;
const decodedTakes = new Map<string, Promise<AudioBuffer>>();
/** Gain per track id (linear, 1 = 0 dB); tracks not in here play at 1. */
const trackGains = new Map<string, number>();
/** Time constant of the ramp when a gain changes while playing (no zipper noise). */
const GAIN_RAMP_SECONDS = 0.015;
/** Fade-out length when a track is cut at the punch point (no click). */
const CUT_FADE_SECONDS = 0.005;

/** How far ahead clicks are scheduled, and how often the scheduler looks. */
const CLICK_LOOKAHEAD_SECONDS = 0.25;
const CLICK_TICK_MS = 50;
/** How far ahead a loop pass is scheduled (it's scheduled whole once its start is this close). */
const LOOP_LOOKAHEAD_SECONDS = 1;

export type MetronomeConfig = { meter: Meter; volume: number };
let metronome: MetronomeConfig | null = null;
/** Click sounds, made once per accent at the context's sample rate. */
const clickBuffers = new Map<ClickAccent, AudioBuffer>();

type ClickScheduler = {
  /** Every click goes through this gain (the metronome volume) to the playback output. */
  gain: GainNode;
  /** Clicks before this elapsed time (seconds since the playback's start) are scheduled or skipped. */
  scheduledUntil: number;
  /** Started click sources with their context start time, for cancelling ones not heard yet. */
  sources: { source: AudioBufferSourceNode; at: number }[];
};

/** Bumped by every `play` and `stopPlayback`, so a `play` still loading audio knows it was superseded. */
let playGeneration = 0;

let playback: {
  sources: AudioBufferSourceNode[];
  /** The graph's output node; disconnecting it releases the whole graph of this playback. */
  output: GainNode;
  /** One gain per track that has audible clips. */
  tracks: Map<string, GainNode>;
  /** Tracks silenced by `cutTrackAt` (and from where): gain changes no longer reach them. */
  cutTracks: Map<string, number>;
  /** What was scheduled, with the gains used (`BackingPlayed`). */
  played: (PlayableClip & { trackGain: number })[];
  /** Ends the playback after the last clip; `undefined` for an endless (recording) playback. */
  endTimer: ReturnType<typeof setTimeout> | undefined;
  clicks: ClickScheduler;
  /** Schedules clicks and loop passes ahead. */
  timer: ReturnType<typeof setInterval>;
  /** The loop region (`null`: plays straight through) and its pass scheduling. */
  loop: LoopScheduler | null;
  /** Called when the last clip finishes; recording clears it so the take keeps going. */
  onEnded: (() => void) | undefined;
  startedAt: number;
  from: number;
  startedAtMs: number;
} | null = null;

type LoopScheduler = {
  region: LoopRegion;
  /** The clips that play in the region, with their decoded audio. */
  clips: (ScheduledClip & { buffer: AudioBuffer | null })[];
  /** The next pass to schedule, and when it starts (elapsed). */
  nextIndex: number;
  nextElapsed: number;
  /** Started sources with the context time they end, for stopping and forgetting them. */
  sources: { source: AudioBufferSourceNode; endsAt: number }[];
};

export type PlaybackAnchor = {
  /** Timeline position (seconds) heard at `startedAtMs`. */
  from: number;
  /** `performance.now()` time when `from` is heard (includes output latency). */
  startedAtMs: number;
  /** The region playback loops in after reaching its end; `null` when it plays straight through. */
  loop: LoopRegion | null;
};

function getContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

/** Play and record at the same time, through the speaker (not the earpiece) or Bluetooth. */
async function activateSession() {
  AudioManager.setSystemOptions({
    ios: {
      category: 'playAndRecord',
      mode: 'default',
      options: ['defaultToSpeaker', 'allowBluetoothA2DP'],
    },
  });
  await AudioManager.setAudioSessionActivity(true);
}

export async function ensureRecordPermission(): Promise<boolean> {
  if ((await AudioManager.checkRecordingPermissions()) === 'Granted') return true;
  return (await AudioManager.requestRecordingPermissions()) === 'Granted';
}

/** Whether the mic may be opened without asking (the meter never triggers the permission prompt). */
export async function hasRecordPermission(): Promise<boolean> {
  return (await AudioManager.checkRecordingPermissions()) === 'Granted';
}

let metering = false;
/** Meter starts and stops run one after another, and recording waits for them. */
let meterQueue: Promise<void> = Promise.resolve();

/**
 * Input metering: with a callback the mic opens and feeds it every input buffer without writing a
 * file; with `null` it closes again. Safe to call in any order (they're queued), and failures just
 * leave the meter off. `startRecording` closes the meter first, since both use the one recorder.
 */
export function setMetering(
  onBuffer: ((samples: Float32Array, sampleRate: number) => void) | null,
): Promise<void> {
  meterQueue = meterQueue
    .then(async () => {
      if (onBuffer) await beginMetering(onBuffer);
      else await endMetering();
    })
    .catch(() => {});
  return meterQueue;
}

async function beginMetering(onBuffer: (samples: Float32Array, sampleRate: number) => void) {
  if (metering || !(await hasRecordPermission())) return;
  await activateSession();
  const activeRecorder = (recorder ??= new AudioRecorder());
  if (activeRecorder.isRecording()) return;
  await activeRecorder.disableFileOutput();
  activeRecorder.onAudioReady(
    {
      sampleRate: AudioManager.getDevicePreferredSampleRate(),
      bufferLength: 2048,
      channelCount: 1,
    },
    ({ buffer }) => onBuffer(buffer.getChannelData(0), buffer.sampleRate),
  );
  const started = await activeRecorder.start();
  if (started.status === 'error') {
    activeRecorder.clearOnAudioReady();
    throw new Error(started.message);
  }
  metering = true;
}

async function endMetering() {
  if (!metering || !recorder) return;
  metering = false;
  recorder.clearOnAudioReady();
  await recorder.stop();
}

export async function startRecording(options: {
  /** File name without extension; must be unique (an existing file is overwritten). */
  fileName: string;
  /** What plays while recording (see `RecordingPlayback`). */
  playback: RecordingPlayback;
  /** Every input buffer, mono samples in -1…1. */
  onBuffer?: (samples: Float32Array, sampleRate: number) => void;
}): Promise<ActiveRecording> {
  // The meter uses the same recorder; close it before anything is scheduled.
  await setMetering(null);
  let from: number;
  if ('clips' in options.playback) {
    from = options.playback.from;
    await play(options.playback.clips, { from, endless: true, silent: options.playback.silent });
  } else {
    // A looped playback can't become a recording's backing (the transport stops it first).
    if (playback?.loop) stopPlayback();
    from = playback?.from ?? options.playback.continueFrom;
    // The take (and the click) keeps going past the last clip.
    if (playback) {
      playback.onEnded = undefined;
      clearTimeout(playback.endTimer);
      playback.endTimer = undefined;
    }
  }
  // `playback` is null when nothing is audible from `from`.
  const backing = playback
    ? { startedAt: playback.startedAt, startedAtMs: playback.startedAtMs }
    : null;
  const ctx = backing ? getContext() : null;
  const playbackOutputLatency = ctx ? outputLatency(ctx) : 0;

  await activateSession();
  const activeRecorder = (recorder ??= new AudioRecorder());

  activeRecorder.enableFileOutput({
    format: FileFormat.Wav,
    preset: RECORDING_PRESET,
    channelCount: RECORDING_CHANNELS,
    directory: FileDirectory.Cache,
    fileName: options.fileName,
  });

  const { onBuffer } = options;
  if (onBuffer) {
    activeRecorder.onAudioReady(
      {
        sampleRate: AudioManager.getDevicePreferredSampleRate(),
        bufferLength: 2048,
        channelCount: 1,
      },
      ({ buffer }) => onBuffer(buffer.getChannelData(0), buffer.sampleRate),
    );
  }

  const started = await activeRecorder.start();
  if (started.status === 'error') {
    activeRecorder.clearOnAudioReady();
    stopPlayback();
    throw new Error(started.message);
  }

  // Where the file's first sample sits on the context clock, and the input latency (only reported
  // while recording).
  let recorderStartedAt = Infinity;
  let inputLatency = 0;
  const alignment = (): TakeAlignment | null =>
    backing && Number.isFinite(recorderStartedAt)
      ? {
          playbackStartedAt: backing.startedAt,
          recorderStartedAt,
          outputLatency: playbackOutputLatency,
          inputLatency,
        }
      : null;
  let resolveStarted: ((value: TakeAlignment | null) => void) | null = null;
  const firstMeasurement = new Promise<TakeAlignment | null>((resolve) => {
    resolveStarted = resolve;
  });
  const settleStarted = (value: TakeAlignment | null) => {
    resolveStarted?.(value);
    resolveStarted = null;
  };
  const measure = () => {
    if (!ctx) return;
    const written = activeRecorder.getCurrentDuration();
    if (written > 0) recorderStartedAt = Math.min(recorderStartedAt, ctx.currentTime - written);
    const latency = activeRecorder.inputLatency;
    if (Number.isFinite(latency) && latency > 0) inputLatency = latency;
    if (Number.isFinite(recorderStartedAt)) settleStarted(alignment());
  };
  const measuredUntil = performance.now() + ALIGN_WINDOW_MS;
  const measureTimer = ctx
    ? setInterval(() => {
        measure();
        if (performance.now() > measuredUntil) {
          clearInterval(measureTimer);
          settleStarted(alignment());
        }
      }, ALIGN_SAMPLE_MS)
    : undefined;
  if (!ctx) settleStarted(null);

  return {
    anchor: { from, startedAtMs: backing?.startedAtMs ?? performance.now(), loop: null },
    whenStarted: () => firstMeasurement,
    async stop() {
      clearInterval(measureTimer);
      measure();
      settleStarted(alignment());
      const backing: BackingPlayed | null = playback
        ? {
            from: playback.from,
            clips: playback.played,
            cuts: [...playback.cutTracks].map(([trackId, position]) => ({ trackId, position })),
            metronome,
          }
        : null;
      stopPlayback();
      const result = await activeRecorder.stop();
      activeRecorder.clearOnAudioReady();
      if (result.status === 'error') throw new Error(result.message);
      const path = result.paths[0];
      if (!path) throw new Error('The recording produced no file.');
      return {
        path,
        duration: result.duration,
        sampleRate: RECORDING_PRESET.sampleRate,
        channels: RECORDING_CHANNELS,
        alignment: alignment(),
        backing,
      };
    },
  };
}

/** Highest absolute sample value, 0–1. */
export function peakLevel(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i] ?? 0);
    if (value > peak) peak = value;
  }
  return Math.min(1, peak);
}

/** Decoded audio of a take (cached; also used for playback). */
export function decodeTake(takePath: string): Promise<AudioBuffer> {
  let buffer = decodedTakes.get(takePath);
  if (!buffer) {
    buffer = getContext().decodeAudioData(takeFilePath(takePath));
    buffer.catch(() => decodedTakes.delete(takePath));
    decodedTakes.set(takePath, buffer);
  }
  return buffer;
}

/** Forget decoded audio for takes that were deleted. */
export function forgetTakes(takePaths: string[]) {
  for (const path of takePaths) decodedTakes.delete(path);
}

/**
 * Plays the clips from timeline position `from` (seconds). Resolves once playback has started.
 * `onEnded` fires when the last clip finishes (not when `stopPlayback` is called). An `endless`
 * playback (recording) runs until `stopPlayback`, and exists without audible clips when the
 * metronome is on. A `silent` one plays nothing out loud (silent recording). With `loop`, playback
 * wraps from the region's end to its start until stopped (`from` should be inside the region).
 */
export async function play(
  clips: PlayableClip[],
  options: {
    from?: number;
    onEnded?: () => void;
    endless?: boolean;
    silent?: boolean;
    loop?: LoopRegion | null;
  } = {},
): Promise<void> {
  stopPlayback();
  const generation = playGeneration;
  const from = options.from ?? 0;
  const region = options.loop && options.loop.end > options.loop.start ? options.loop : null;
  const joined = seamlessEdges(clips);
  const audible = region
    ? joined.filter(
        (clip) =>
          clip.start + clip.duration > Math.min(from, region.start) && clip.start < region.end,
      )
    : joined.filter((clip) => clip.start + clip.duration > from);
  if (!region && audible.length === 0 && !(options.endless && metronome)) {
    options.onEnded?.();
    return;
  }

  await activateSession();
  const ctx = getContext();
  // The recorder and other apps can leave the context suspended; make sure it's running.
  if (ctx.state !== 'running') await ctx.resume();
  const buffers = await Promise.all(audible.map((clip) => decodeTake(clip.takePath)));
  // Stopped, or another `play` started, while the audio was loading: don't start a second playback.
  if (generation !== playGeneration) return;

  const master = ctx.createGain();
  if (options.silent) master.gain.value = 0;
  master.connect(ctx.destination);
  const startedAt = ctx.currentTime + SCHEDULE_AHEAD_SECONDS;
  const startedAtMs = performance.now() + (SCHEDULE_AHEAD_SECONDS + outputLatency(ctx)) * 1000;
  let end = 0;

  const tracks = new Map<string, GainNode>();
  const trackGain = (trackId: string) => trackGainNode(ctx, tracks, master, trackId);

  // A loop's passes are scheduled by the tick; straight playback starts every clip now.
  const sources = (region ? [] : audible).map((clip, index) => {
    const skipped = Math.max(0, from - clip.start);
    const source = ctx.createBufferSource();
    source.buffer = buffers[index] ?? null;
    const at = startedAt + Math.max(0, clip.start - from);
    source.connect(
      clipGainNode(ctx, clip, skipped, clip.duration - skipped, at, trackGain(clip.trackId)),
    );
    source.start(at, clip.offset + skipped, clip.duration - skipped);
    end = Math.max(end, clip.start + clip.duration - from);
    return source;
  });

  const clickGain = ctx.createGain();
  clickGain.gain.value = metronome?.volume ?? 1;
  clickGain.connect(master);

  const current: NonNullable<typeof playback> = {
    sources,
    output: master,
    tracks,
    cutTracks: new Map(),
    played: audible.map(({ seamlessIn: _in, seamlessOut: _out, ...clip }) => ({
      ...clip,
      trackGain: trackGains.get(clip.trackId) ?? 1,
    })),
    endTimer:
      options.endless || region
        ? undefined
        : setTimeout(
            () => {
              endPlayback(current);
              if (playback === current) playback = null;
              current.onEnded?.();
            },
            (end + SCHEDULE_AHEAD_SECONDS) * 1000,
          ),
    clicks: { gain: clickGain, scheduledUntil: 0, sources: [] },
    timer: setInterval(() => tick(current), CLICK_TICK_MS),
    loop: region
      ? {
          region,
          clips: audible.map((clip, index) => ({ ...clip, buffer: buffers[index] ?? null })),
          nextIndex: 0,
          nextElapsed: 0,
          sources: [],
        }
      : null,
    onEnded: region ? undefined : options.onEnded,
    startedAt,
    from,
    startedAtMs,
  };
  playback = current;
  tick(current);
}

/**
 * The clip's own gain node (T16), connected to `output`: plays its envelope (`clip-envelope.ts`) for
 * `length` seconds from `from` seconds into the clip, starting at context time `at`.
 */
function clipGainNode(
  ctx: AudioContext,
  clip: ScheduledClip,
  from: number,
  length: number,
  at: number,
  output: GainNode,
): GainNode {
  const node = ctx.createGain();
  const [first, ...rest] = envelopePoints(clip, from, length);
  node.gain.value = first?.value ?? clip.gain;
  node.gain.setValueAtTime(node.gain.value, at);
  for (const point of rest) node.gain.linearRampToValueAtTime(point.value, at + point.time);
  node.connect(output);
  return node;
}

/** One gain per track, made on first use at the track's current gain. */
function trackGainNode(
  ctx: AudioContext,
  tracks: Map<string, GainNode>,
  output: GainNode,
  trackId: string,
): GainNode {
  let node = tracks.get(trackId);
  if (!node) {
    node = ctx.createGain();
    node.gain.value = trackGains.get(trackId) ?? 1;
    node.connect(output);
    tracks.set(trackId, node);
  }
  return node;
}

function tick(current: NonNullable<typeof playback>) {
  scheduleLoop(current);
  scheduleClicks(current);
}

/**
 * Starts every clip piece of the loop passes that begin within the lookahead, each pass whole, with
 * fades where the loop cuts a clip.
 */
function scheduleLoop(current: NonNullable<typeof playback>) {
  const loop = current.loop;
  if (!loop || !context) return;
  const ctx = context;
  const now = ctx.currentTime;
  const until = now - current.startedAt + LOOP_LOOKAHEAD_SECONDS;
  for (const segment of loopSegments(current.from, loop.region, loop.nextElapsed, until)) {
    if (segment.index < loop.nextIndex) continue;
    for (const piece of clipPieces(loop.clips, segment)) {
      const at = current.startedAt + piece.at;
      // Late (the JS thread stalled): start now, further into the take, so it stays in time.
      const late = Math.max(0, now - at);
      if (late >= piece.duration) continue;
      const source = ctx.createBufferSource();
      source.buffer = piece.clip.buffer;
      const track = clipGainNode(
        ctx,
        piece.clip,
        piece.offset + late - piece.clip.offset,
        piece.duration - late,
        at + late,
        trackGainNode(ctx, current.tracks, current.output, piece.clip.trackId),
      );
      if (piece.fadeIn > 0 || piece.fadeOut > 0) {
        const fade = ctx.createGain();
        fade.gain.value = piece.fadeIn > 0 ? 0 : 1;
        fade.gain.setValueAtTime(fade.gain.value, at);
        if (piece.fadeIn > 0) fade.gain.linearRampToValueAtTime(1, at + piece.fadeIn);
        if (piece.fadeOut > 0) {
          const fadeOutAt = current.startedAt + piece.fadeOutAt;
          fade.gain.setValueAtTime(1, fadeOutAt);
          fade.gain.linearRampToValueAtTime(0, fadeOutAt + piece.fadeOut);
        }
        fade.connect(track);
        source.connect(fade);
      } else {
        source.connect(track);
      }
      source.start(at + late, piece.offset + late, piece.duration - late);
      loop.sources.push({ source, endsAt: at + piece.duration });
    }
    loop.nextIndex = segment.index + 1;
    loop.nextElapsed = segment.elapsed + (segment.end - segment.start);
  }
  // Forget pieces that have finished.
  loop.sources = loop.sources.filter(({ endsAt }) => endsAt > now - 1);
}

/** Starts the clicks that fall in the next lookahead window (none while the metronome is off). */
function scheduleClicks(current: NonNullable<typeof playback>) {
  if (!context) return;
  const ctx = context;
  const clicks = current.clicks;
  const now = ctx.currentTime;
  const elapsed = now - current.startedAt;
  const until = elapsed + CLICK_LOOKAHEAD_SECONDS;
  if (metronome && until > clicks.scheduledUntil) {
    // A click whose time has passed (the JS thread stalled) is skipped rather than played late.
    const fromElapsed = Math.max(clicks.scheduledUntil, elapsed);
    const region = current.loop?.region ?? null;
    for (const segment of loopSegments(current.from, region, fromElapsed, until)) {
      const a = segment.start + Math.max(0, fromElapsed - segment.elapsed);
      const b = Math.min(segment.end, segment.start + (until - segment.elapsed));
      for (const click of clicksBetween(metronome.meter, a, b)) {
        const at = current.startedAt + segment.elapsed + (click.position - segment.start);
        const source = ctx.createBufferSource();
        source.buffer = clickBuffer(ctx, click.accent);
        source.connect(clicks.gain);
        source.start(at);
        clicks.sources.push({ source, at });
      }
    }
    clicks.scheduledUntil = until;
  } else if (!metronome) {
    clicks.scheduledUntil = Math.max(clicks.scheduledUntil, elapsed);
  }
  // Forget clicks that have finished.
  clicks.sources = clicks.sources.filter(({ at }) => at > now - 1);
}

/** Stops clicks that haven't sounded yet, and schedules from now on again. */
function cancelClicks(current: NonNullable<typeof playback>) {
  if (!context) return;
  const now = context.currentTime;
  for (const { source, at } of current.clicks.sources) {
    if (at <= now) continue;
    try {
      source.stop();
    } catch {
      // Already finished.
    }
  }
  current.clicks.sources = current.clicks.sources.filter(({ at }) => at <= now);
  current.clicks.scheduledUntil = now - current.startedAt;
}

function clickBuffer(ctx: AudioContext, accent: ClickAccent): AudioBuffer {
  let buffer = clickBuffers.get(accent);
  if (!buffer || buffer.sampleRate !== ctx.sampleRate) {
    const samples = clickSamples(accent, ctx.sampleRate);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    clickBuffers.set(accent, buffer);
  }
  return buffer;
}

/**
 * Turns the metronome on with a meter and volume (linear gain, 1 = 0 dB), or off with `null`. Applies
 * live to the playback that's running: volume changes ramp, and a new meter (or turning it off)
 * drops the clicks scheduled ahead so the next ones follow the change.
 */
export function setMetronome(config: MetronomeConfig | null) {
  const previous = metronome;
  metronome = config;
  if (!playback || !context) return;
  const meterChanged =
    !config ||
    !previous ||
    config.meter.bpm !== previous.meter.bpm ||
    config.meter.beatsPerBar !== previous.meter.beatsPerBar ||
    config.meter.beatUnit !== previous.meter.beatUnit;
  if (meterChanged) cancelClicks(playback);
  if (config) {
    playback.clicks.gain.gain.setTargetAtTime(
      config.volume,
      context.currentTime,
      GAIN_RAMP_SECONDS,
    );
    if (meterChanged) scheduleClicks(playback);
  }
}

/** Releases a playback's graph and stops its click scheduler. */
function endPlayback(current: NonNullable<typeof playback>) {
  clearInterval(current.timer);
  current.output.disconnect();
}

/**
 * Silences a playing track from timeline position `position` on (or now, if that has passed), with a
 * short fade. It stays silent for the rest of this playback, whatever `setTrackGain` says.
 */
export function cutTrackAt(trackId: string, position: number) {
  if (!playback || !context) return;
  playback.cutTracks.set(trackId, position);
  const node = playback.tracks.get(trackId);
  if (!node) return; // Nothing of this track is playing.
  const now = context.currentTime;
  const at = Math.max(now, playback.startedAt + (position - playback.from));
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, Math.max(now, at - CUT_FADE_SECONDS));
  node.gain.linearRampToValueAtTime(0, at);
}

/**
 * Fades the whole output (clips and clicks) to silence from timeline position `from` to `to` (moved
 * to now if they have passed). It stays silent for the rest of this playback.
 */
export function silenceOutput(from: number, to: number) {
  const current = playback;
  if (!current || !context) return;
  const master = current.output.gain;
  const now = context.currentTime;
  const toContext = (position: number) =>
    Math.max(now, current.startedAt + (position - current.from));
  const end = toContext(to);
  master.cancelScheduledValues(now);
  master.setValueAtTime(master.value, Math.min(end, toContext(from)));
  master.linearRampToValueAtTime(0, end);
}

/**
 * Sets a track's gain (linear, 1 = 0 dB) for this and later playbacks; a playing track changes
 * smoothly at once. Cheap: call it per fader move.
 */
export function setTrackGain(trackId: string, gain: number) {
  if (!Number.isFinite(gain) || gain < 0) return;
  trackGains.set(trackId, gain);
  if (playback?.cutTracks.has(trackId)) return;
  const node = playback?.tracks.get(trackId);
  if (node && context) node.gain.setTargetAtTime(gain, context.currentTime, GAIN_RAMP_SECONDS);
}

export function stopPlayback() {
  playGeneration++;
  if (!playback) return;
  clearTimeout(playback.endTimer);
  for (const source of [
    ...playback.sources,
    ...playback.clicks.sources.map((c) => c.source),
    ...(playback.loop?.sources.map((s) => s.source) ?? []),
  ]) {
    try {
      source.stop();
    } catch {
      // Already finished.
    }
  }
  endPlayback(playback);
  playback = null;
}

// Pitch reference keyboard (T20).

/** Partial amplitudes of the keyboard tone (fundamental first): soft, clear pitch, no samples. */
const NOTE_PARTIALS = [1, 0.42, 0.18, 0.1, 0.05, 0.025];
/** Level of one note at 0 dB keyboard volume (leaves headroom for chords). */
const NOTE_LEVEL = 0.25;
const NOTE_ATTACK_SECONDS = 0.005;
/** After the attack the note settles to this part of its level, like a struck string. */
const NOTE_SUSTAIN = 0.55;
const NOTE_DECAY_TIME_CONSTANT = 0.35;
const NOTE_RELEASE_TIME_CONSTANT = 0.06;
/** The oscillator stops this long after release, when the tail is inaudible. */
const NOTE_TAIL_SECONDS = 0.5;

let keyboardBus: GainNode | null = null;
let noteWave: PeriodicWave | null = null;
let keyboardReady: Promise<void> | null = null;

export type NoteHandle = { oscillator: OscillatorNode; envelope: GainNode };

/**
 * Gets the audio session and context ready for the keyboard (call when it opens), so the first key
 * sounds without a delay. Safe to call again.
 */
export function prepareKeyboard(): Promise<void> {
  keyboardReady ??= (async () => {
    await activateSession();
    const ctx = getContext();
    if (ctx.state !== 'running') await ctx.resume();
  })().catch(() => {
    keyboardReady = null; // try again next time
  });
  return keyboardReady;
}

/** Starts a note at `frequency` Hz, at `volume` (linear, 1 = 0 dB). Returns what `stopNote` needs. */
export function startNote(frequency: number, volume: number): NoteHandle | null {
  if (!(frequency > 0) || !(volume > 0)) return null;
  const ctx = getContext();
  // Something else (the recorder, another app) may have suspended it since the keyboard opened.
  if (ctx.state !== 'running') void ctx.resume();
  if (!keyboardBus) {
    keyboardBus = ctx.createGain();
    keyboardBus.connect(ctx.destination);
  }
  noteWave ??= ctx.createPeriodicWave(
    new Float32Array(NOTE_PARTIALS.length + 1),
    Float32Array.from([0, ...NOTE_PARTIALS]),
  );
  const now = ctx.currentTime;
  // The volume setting goes up to +6 dB (2×), like the faders.
  const level = NOTE_LEVEL * Math.min(2, volume);
  const envelope = ctx.createGain();
  envelope.gain.value = 0;
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(level, now + NOTE_ATTACK_SECONDS);
  envelope.gain.setTargetAtTime(
    level * NOTE_SUSTAIN,
    now + NOTE_ATTACK_SECONDS,
    NOTE_DECAY_TIME_CONSTANT,
  );
  envelope.connect(keyboardBus);
  const oscillator = ctx.createOscillator();
  oscillator.setPeriodicWave(noteWave);
  oscillator.frequency.value = frequency;
  oscillator.connect(envelope);
  oscillator.start(now);
  return { oscillator, envelope };
}

/** Releases a note smoothly (no click) and frees it once its tail has faded. */
export function stopNote(note: NoteHandle) {
  if (!context) return;
  const now = context.currentTime;
  note.envelope.gain.cancelAndHoldAtTime(now);
  note.envelope.gain.setTargetAtTime(0, now, NOTE_RELEASE_TIME_CONSTANT);
  try {
    note.oscillator.stop(now + NOTE_TAIL_SECONDS);
  } catch {
    // Already stopped.
  }
  note.oscillator.onended = () => {
    note.oscillator.disconnect();
    note.envelope.disconnect();
  };
}

/** Output latency in seconds; 0 when the platform doesn't report it. */
function outputLatency(ctx: AudioContext): number {
  const latency = ctx.outputLatency;
  return Number.isFinite(latency) && latency > 0 ? latency : 0;
}

/** When playback started, for animating the playhead; `null` when not playing. */
export function playbackAnchor(): PlaybackAnchor | null {
  return playback
    ? {
        from: playback.from,
        startedAtMs: playback.startedAtMs,
        loop: playback.loop?.region ?? null,
      }
    : null;
}

export function isPlaying(): boolean {
  return playback != null;
}

/** Current timeline position in seconds while playing, otherwise `null`. */
export function playbackPosition(): number | null {
  if (!playback || !context) return null;
  return loopedPosition(
    playback.from,
    playback.loop?.region ?? null,
    Math.max(0, context.currentTime - playback.startedAt),
  );
}
