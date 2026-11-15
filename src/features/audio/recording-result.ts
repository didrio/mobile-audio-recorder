import type { FileInfo, Result } from 'react-native-audio-api';

/**
 * The file a recording produced (T7). Normally what the recorder's `stop()` returned. When the system
 * already stopped the recording natively (Android: the notification's Stop button, the foreground
 * service ending, a failed input reroute), `stop()` reports an error and the file is the one the
 * library stashed for `AudioRecorder.consumeLastRecordingResult()`. The library stashes every
 * successful stop, so the caller consumes the stash every time and passes it here.
 */
export function pickRecordingResult(
  stopped: Result<FileInfo>,
  stashed: FileInfo | null,
): { ok: true; file: FileInfo } | { ok: false; message: string } {
  if (stopped.status === 'success') {
    return {
      ok: true,
      file: { paths: stopped.paths, size: stopped.size, duration: stopped.duration },
    };
  }
  if (stashed && stashed.paths.length > 0) return { ok: true, file: stashed };
  return { ok: false, message: stopped.message };
}
