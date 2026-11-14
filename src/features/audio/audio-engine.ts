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
 *   its timeline position: source → track gain → master gain → speakers. Decoded takes are cached.
 * - Mixer: `setTrackGain` keeps each track's gain (track volume; later × mute/solo). Playback builds
 *   one `GainNode` per track from it, and changes apply live (short ramp) to the playing graph,
 *   including the backing playback while recording.
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
} from 'react-native-audio-api';

import type { TakeAlignment } from './take-alignment';
import { takeFilePath } from './take-files';

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
export type RecordingPlayback = { clips: PlayableClip[]; from: number } | { continueFrom: number };

export type PlayableClip = {
  /** Take path relative to the document directory (as stored in the database). */
  takePath: string;
  /** Its track: the clip plays through that track's gain (`setTrackGain`). */
  trackId: string;
  /** Timeline position, offset into the take, and length: all in seconds. */
  start: number;
  offset: number;
  duration: number;
};

let context: AudioContext | null = null;
let recorder: AudioRecorder | null = null;
const decodedTakes = new Map<string, Promise<AudioBuffer>>();
/** Gain per track id (linear, 1 = 0 dB); tracks not in here play at 1. */
const trackGains = new Map<string, number>();
/** Time constant of the ramp when a gain changes while playing (no zipper noise). */
const GAIN_RAMP_SECONDS = 0.015;
/** Fade-out length when a track is cut at the punch point (no click). */
const CUT_FADE_SECONDS = 0.005;

/** Bumped by every `play` and `stopPlayback`, so a `play` still loading audio knows it was superseded. */
let playGeneration = 0;

let playback: {
  sources: AudioBufferSourceNode[];
  /** The graph's output node; disconnecting it releases the whole graph of this playback. */
  output: GainNode;
  /** One gain per track that has audible clips. */
  tracks: Map<string, GainNode>;
  /** Tracks silenced by `cutTrackAt`: gain changes no longer reach them. */
  cutTracks: Set<string>;
  endTimer: ReturnType<typeof setTimeout>;
  /** Called when the last clip finishes; recording clears it so the take keeps going. */
  onEnded: (() => void) | undefined;
  startedAt: number;
  from: number;
  startedAtMs: number;
} | null = null;

export type PlaybackAnchor = {
  /** Timeline position (seconds) heard at `startedAtMs`. */
  from: number;
  /** `performance.now()` time when `from` is heard (includes output latency). */
  startedAtMs: number;
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
    await play(options.playback.clips, { from });
  } else {
    from = playback?.from ?? options.playback.continueFrom;
    // The take keeps going past the last clip.
    if (playback) playback.onEnded = undefined;
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
    anchor: { from, startedAtMs: backing?.startedAtMs ?? performance.now() },
    whenStarted: () => firstMeasurement,
    async stop() {
      clearInterval(measureTimer);
      measure();
      settleStarted(alignment());
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
 * `onEnded` fires when the last clip finishes (not when `stopPlayback` is called).
 */
export async function play(
  clips: PlayableClip[],
  options: { from?: number; onEnded?: () => void } = {},
): Promise<void> {
  stopPlayback();
  const generation = playGeneration;
  const from = options.from ?? 0;
  const audible = clips.filter((clip) => clip.start + clip.duration > from);
  if (audible.length === 0) {
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
  master.connect(ctx.destination);
  const startedAt = ctx.currentTime + SCHEDULE_AHEAD_SECONDS;
  const startedAtMs = performance.now() + (SCHEDULE_AHEAD_SECONDS + outputLatency(ctx)) * 1000;
  let end = 0;

  const tracks = new Map<string, GainNode>();
  const trackGain = (trackId: string) => {
    let node = tracks.get(trackId);
    if (!node) {
      node = ctx.createGain();
      node.gain.value = trackGains.get(trackId) ?? 1;
      node.connect(master);
      tracks.set(trackId, node);
    }
    return node;
  };

  const sources = audible.map((clip, index) => {
    const skipped = Math.max(0, from - clip.start);
    const source = ctx.createBufferSource();
    source.buffer = buffers[index] ?? null;
    source.connect(trackGain(clip.trackId));
    source.start(
      startedAt + Math.max(0, clip.start - from),
      clip.offset + skipped,
      clip.duration - skipped,
    );
    end = Math.max(end, clip.start + clip.duration - from);
    return source;
  });

  const current: NonNullable<typeof playback> = {
    sources,
    output: master,
    tracks,
    cutTracks: new Set(),
    endTimer: setTimeout(
      () => {
        master.disconnect();
        if (playback === current) playback = null;
        current.onEnded?.();
      },
      (end + SCHEDULE_AHEAD_SECONDS) * 1000,
    ),
    onEnded: options.onEnded,
    startedAt,
    from,
    startedAtMs,
  };
  playback = current;
}

/**
 * Silences a playing track from timeline position `position` on (or now, if that has passed), with a
 * short fade. It stays silent for the rest of this playback, whatever `setTrackGain` says.
 */
export function cutTrackAt(trackId: string, position: number) {
  if (!playback || !context) return;
  playback.cutTracks.add(trackId);
  const node = playback.tracks.get(trackId);
  if (!node) return; // Nothing of this track is playing.
  const now = context.currentTime;
  const at = Math.max(now, playback.startedAt + (position - playback.from));
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, Math.max(now, at - CUT_FADE_SECONDS));
  node.gain.linearRampToValueAtTime(0, at);
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
  for (const source of playback.sources) {
    try {
      source.stop();
    } catch {
      // Already finished.
    }
  }
  playback.output.disconnect();
  playback = null;
}

/** Output latency in seconds; 0 when the platform doesn't report it. */
function outputLatency(ctx: AudioContext): number {
  const latency = ctx.outputLatency;
  return Number.isFinite(latency) && latency > 0 ? latency : 0;
}

/** When playback started, for animating the playhead; `null` when not playing. */
export function playbackAnchor(): PlaybackAnchor | null {
  return playback ? { from: playback.from, startedAtMs: playback.startedAtMs } : null;
}

export function isPlaying(): boolean {
  return playback != null;
}

/** Current timeline position in seconds while playing, otherwise `null`. */
export function playbackPosition(): number | null {
  if (!playback || !context) return null;
  return playback.from + Math.max(0, context.currentTime - playback.startedAt);
}
