/**
 * A small WAV (RIFF, integer PCM) encoder for rendered audio (T36): the WAV export, and the
 * intermediate file the native M4A encoder reads. Samples are -1…1 floats; anything outside is
 * clipped (the export normalizes first, or warns).
 */

export type WavBitDepth = 16 | 24;

const HEADER_BYTES = 44;

/** The bytes of a WAV file holding `channels` (all the same length) at `sampleRate`. */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number,
  bitDepth: WavBitDepth = 24,
): Uint8Array<ArrayBuffer> {
  const channelCount = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);

  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // integer PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const max = bitDepth === 24 ? 8388607 : 32767;
  let at = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = channels[channel]?.[frame] ?? 0;
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample || 0;
      const value = Math.round(clamped * max);
      bytes[at] = value & 0xff;
      bytes[at + 1] = (value >> 8) & 0xff;
      if (bitDepth === 24) bytes[at + 2] = (value >> 16) & 0xff;
      at += bytesPerSample;
    }
  }
  return bytes;
}

function writeAscii(bytes: Uint8Array, at: number, text: string) {
  for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
}
