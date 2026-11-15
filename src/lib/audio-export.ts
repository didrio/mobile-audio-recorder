import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The local native module in `modules/audio-export` (T36, T37): encodes a rendered WAV to M4A (AAC),
 * and opens one share sheet for several files (expo-sharing takes one). See its README.
 */
type AudioExportModule = {
  encodeM4A(wavPath: string, outputPath: string, bitRate: number): Promise<void>;
  shareFiles(paths: string[]): Promise<void>;
};

const native = requireOptionalNativeModule<AudioExportModule>('AudioExport');

/** False in a build made before the module existed (or Expo Go): M4A and multi-file sharing are off. */
export const isAudioExportAvailable = native != null;

/** AAC bit rate for mono M4A exports: transparent for a sketch, small enough to send. */
export const M4A_BIT_RATE = 160_000;

/** Writes the WAV at `wavPath` (plain path) as M4A to `outputPath`. Runs natively, off the JS thread. */
export function encodeM4A(wavPath: string, outputPath: string): Promise<void> {
  if (!native) return Promise.reject(new Error('M4A export needs the latest app build.'));
  return native.encodeM4A(wavPath, outputPath, M4A_BIT_RATE);
}

/** Shares the files at these plain paths in one share sheet; resolves when it closes. */
export function shareFiles(paths: string[]): Promise<void> {
  if (!native)
    return Promise.reject(new Error('Sharing several files needs the latest app build.'));
  return native.shareFiles(paths);
}
