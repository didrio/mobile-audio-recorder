import { useHeadphones, speakerModeApplies } from '@/features/audio/audio-route';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import { SPEAKER_MODE_ENABLED, isEchoCancellerAvailable } from '@/lib/echo-canceller';

export type SpeakerRecording = {
  /**
   * Silent recording (T34) applies to a take recorded now: it's on in Settings and no headphones are
   * connected (with them nothing reaches the mic, and muting would only take the backing away).
   */
  silent: boolean;
  /**
   * The take gets the backing removed afterwards: Speaker mode is on in Settings, the device can do
   * it, no headphones are connected, and the take isn't recorded in silence (nothing to remove).
   */
  clean: boolean;
};

/** How a take recorded through the speaker (no headphones) is kept free of the backing. */
export function useSpeakerRecording(): SpeakerRecording {
  const speakerMode = useRecordingSettingsStore((state) => state.speakerMode);
  const silentRecording = useRecordingSettingsStore((state) => state.silentRecording);
  const headphones = useHeadphones();
  const silent = speakerModeApplies(silentRecording, headphones);
  return {
    silent,
    clean:
      SPEAKER_MODE_ENABLED &&
      isEchoCancellerAvailable &&
      speakerModeApplies(speakerMode, headphones) &&
      !silent,
  };
}
