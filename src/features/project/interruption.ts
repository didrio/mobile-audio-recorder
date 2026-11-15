import type { InterruptionReason } from '@/features/audio/audio-engine';

import type { TransportStatus } from './use-transport';

export type InterruptionAction =
  { kind: 'stopRecording'; message: string } | { kind: 'pausePlayback' } | { kind: 'none' };

/**
 * What the transport does when the system interrupts audio (T7). A recording stops and its take
 * is saved up to that moment, with a note saying why it ended. Playback pauses where it is. Nothing
 * resumes by itself afterwards. While starting or stopping nothing happens: a start that can't get
 * the mic fails with its own error, and the next interruption finds it recording.
 */
export function interruptionAction(
  status: TransportStatus,
  reason: InterruptionReason,
): InterruptionAction {
  if (status === 'recording') {
    return { kind: 'stopRecording', message: interruptionMessage(reason) };
  }
  if (status === 'playing') return { kind: 'pausePlayback' };
  return { kind: 'none' };
}

function interruptionMessage(reason: InterruptionReason): string {
  switch (reason) {
    case 'interruption':
      return 'Recording stopped by another app or a call. The take is saved up to there.';
    case 'notificationStop':
      return 'Recording stopped from the notification.';
    case 'recorderError':
      return 'Recording stopped: the microphone went away. The take is saved up to there.';
  }
}
