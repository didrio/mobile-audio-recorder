import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The local native module in `modules/audio-input` (T38): the current input's channel count and gain,
 * pulling one channel out of a multi-channel take, and (iOS) the system's output route button
 * (`RoutePickerView` in `@/features/audio/route-picker-button`). See its README.
 */
export type InputInfo = {
  /** Channels the current input delivers (a two-input interface: 2). At least 1. */
  channelCount: number;
  /** Whether the app may set the input gain (iOS, some inputs); never on Android. */
  gainSettable: boolean;
  /** The current input gain, 0…1. */
  gain: number;
  /**
   * What the system reports for the current route (T39), in seconds: the hardware's input and output
   * latency (without the app's IO buffers) and the session's sample rate. `null` where the platform
   * doesn't say (Android) or in an older build.
   */
  latency: RouteLatency | null;
};

export type RouteLatency = { input: number; output: number; sampleRate: number };

type NativeInputInfo = Omit<InputInfo, 'latency'> & {
  inputLatency?: number;
  outputLatency?: number;
  sampleRate?: number;
};

type AudioInputModule = {
  getInputInfo(deviceId: string | null): Promise<NativeInputInfo>;
  setInputGain(gain: number): Promise<boolean>;
  extractChannel(sourcePath: string, outputPath: string, channel: number): Promise<void>;
};

const native = requireOptionalNativeModule<AudioInputModule>('AudioInput');

/** False in a build made before the module existed: one mono channel, no gain, no route button. */
export const isAudioInputAvailable = native != null;

const MONO_INPUT: InputInfo = { channelCount: 1, gainSettable: false, gain: 1, latency: null };

/**
 * The current input's channels, gain and (iOS) route latency. Android needs the selected device's id (from the audio
 * library) to find it; `null` means the built-in mic there. Falls back to a plain mono input.
 */
export async function getInputInfo(deviceId: string | null): Promise<InputInfo> {
  if (!native) return MONO_INPUT;
  try {
    const { inputLatency, outputLatency, sampleRate, ...info } =
      await native.getInputInfo(deviceId);
    const latency =
      typeof inputLatency === 'number' &&
      typeof outputLatency === 'number' &&
      typeof sampleRate === 'number' &&
      sampleRate > 0
        ? { input: inputLatency, output: outputLatency, sampleRate }
        : null;
    return { ...info, latency };
  } catch {
    return MONO_INPUT;
  }
}

/** Sets the input gain (0…1); false when this input's gain can't be set. */
export function setInputGain(gain: number): Promise<boolean> {
  if (!native) return Promise.resolve(false);
  return native.setInputGain(gain);
}

/**
 * Writes channel `channel` (0-based) of the WAV at `sourcePath` as a mono WAV at `outputPath` (plain
 * paths), same sample rate and format. Runs natively, off the JS thread.
 */
export function extractChannel(
  sourcePath: string,
  outputPath: string,
  channel: number,
): Promise<void> {
  if (!native)
    return Promise.reject(new Error('Choosing an input channel needs the latest app build.'));
  return native.extractChannel(sourcePath, outputPath, channel);
}
