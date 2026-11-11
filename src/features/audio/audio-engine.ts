/**
 * The app's audio engine: the only module that talks to `react-native-audio-api` (Web Audio API).
 * Features and tests use these functions, never the library directly.
 *
 * - Recording: `AudioRecorder` writes a lossless mono WAV to the cache; the caller moves it into the
 *   project (see `take-files.ts`). `onLevel` gets a 0–1 peak level per input buffer.
 * - Playback: one shared `AudioContext`. Every clip becomes an `AudioBufferSourceNode` started at
 *   its timeline position: source → track gain → master gain → speakers. Decoded takes are cached.
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
} from 'react-native-audio-api';

import { takeFilePath } from './take-files';

const RECORDING_PRESET = FilePreset.Lossless;
const RECORDING_CHANNELS = 1;
/** Small lead time so every source is scheduled before the first one has to sound. */
const SCHEDULE_AHEAD_SECONDS = 0.05;

export type RecordedTake = {
  /** Absolute path of the recorded file (in the cache, to be moved by the caller). */
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
};

export type ActiveRecording = {
  stop(): Promise<RecordedTake>;
};

export type PlayableClip = {
  /** Take path relative to the document directory (as stored in the database). */
  takePath: string;
  /** Timeline position, offset into the take, and length: all in seconds. */
  start: number;
  offset: number;
  duration: number;
  /** Track volume, 0–1+. */
  volume: number;
};

let context: AudioContext | null = null;
let recorder: AudioRecorder | null = null;
const decodedTakes = new Map<string, Promise<AudioBuffer>>();

let playback: {
  sources: AudioBufferSourceNode[];
  endTimer: ReturnType<typeof setTimeout>;
  startedAt: number;
  from: number;
} | null = null;

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

export async function startRecording(options: {
  /** File name without extension; must be unique (an existing file is overwritten). */
  fileName: string;
  onLevel?: (level: number) => void;
}): Promise<ActiveRecording> {
  await activateSession();
  const activeRecorder = (recorder ??= new AudioRecorder());

  activeRecorder.enableFileOutput({
    format: FileFormat.Wav,
    preset: RECORDING_PRESET,
    channelCount: RECORDING_CHANNELS,
    directory: FileDirectory.Cache,
    fileName: options.fileName,
  });

  const { onLevel } = options;
  if (onLevel) {
    activeRecorder.onAudioReady(
      {
        sampleRate: AudioManager.getDevicePreferredSampleRate(),
        bufferLength: 2048,
        channelCount: 1,
      },
      ({ buffer }) => onLevel(peakLevel(buffer.getChannelData(0))),
    );
  }

  const started = await activeRecorder.start();
  if (started.status === 'error') {
    activeRecorder.clearOnAudioReady();
    throw new Error(started.message);
  }

  return {
    async stop() {
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

function loadTake(takePath: string): Promise<AudioBuffer> {
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
  const from = options.from ?? 0;
  const audible = clips.filter((clip) => clip.start + clip.duration > from);
  if (audible.length === 0) {
    options.onEnded?.();
    return;
  }

  await activateSession();
  const ctx = getContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const buffers = await Promise.all(audible.map((clip) => loadTake(clip.takePath)));

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const startedAt = ctx.currentTime + SCHEDULE_AHEAD_SECONDS;
  let end = 0;

  const sources = audible.map((clip, index) => {
    const skipped = Math.max(0, from - clip.start);
    const gain = ctx.createGain();
    gain.gain.value = clip.volume;
    gain.connect(master);
    const source = ctx.createBufferSource();
    source.buffer = buffers[index] ?? null;
    source.connect(gain);
    source.start(
      startedAt + Math.max(0, clip.start - from),
      clip.offset + skipped,
      clip.duration - skipped,
    );
    end = Math.max(end, clip.start + clip.duration - from);
    return source;
  });

  const endTimer = setTimeout(
    () => {
      playback = null;
      options.onEnded?.();
    },
    (end + SCHEDULE_AHEAD_SECONDS) * 1000,
  );
  playback = { sources, endTimer, startedAt, from };
}

export function stopPlayback() {
  if (!playback) return;
  clearTimeout(playback.endTimer);
  for (const source of playback.sources) {
    try {
      source.stop();
    } catch {
      // Already finished.
    }
  }
  playback = null;
}

export function isPlaying(): boolean {
  return playback != null;
}

/** Current timeline position in seconds while playing, otherwise `null`. */
export function playbackPosition(): number | null {
  if (!playback || !context) return null;
  return playback.from + Math.max(0, context.currentTime - playback.startedAt);
}
