import { useHeadphones, speakerModeApplies } from '@/features/audio/audio-route';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import { isEchoCancellerAvailable } from '@/lib/echo-canceller';

/**
 * Whether a take recorded now gets the backing removed afterwards: Speaker mode is on in Settings,
 * the device can do it, and no headphones are connected (with them nothing leaks into the mic).
 */
export function useSpeakerMode(): boolean {
  const speakerMode = useRecordingSettingsStore((state) => state.speakerMode);
  const headphones = useHeadphones();
  return isEchoCancellerAvailable && speakerModeApplies(speakerMode, headphones);
}
