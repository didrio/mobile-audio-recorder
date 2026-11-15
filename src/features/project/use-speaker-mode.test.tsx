import { renderHook } from '@testing-library/react-native';

import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import * as echoCanceller from '@/lib/echo-canceller';

import { useSpeakerRecording } from './use-speaker-mode';

jest.mock('@/features/audio/audio-route', () => ({
  ...jest.requireActual('@/features/audio/audio-route'),
  useHeadphones: () => false,
}));

describe('useSpeakerRecording', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    useRecordingSettingsStore.setState({ speakerMode: true, silentRecording: false });
  });

  it('cleans takes when Speaker mode is switched on in the app and in Settings', async () => {
    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current.clean).toBe(true);
  });

  it('never cleans while Speaker mode is shelved, even if speakerMode was saved as true', async () => {
    jest.replaceProperty(echoCanceller, 'SPEAKER_MODE_ENABLED', false);

    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current.clean).toBe(false);
  });

  it('keeps silent recording working with Speaker mode shelved', async () => {
    jest.replaceProperty(echoCanceller, 'SPEAKER_MODE_ENABLED', false);
    useRecordingSettingsStore.setState({ silentRecording: true });

    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current).toEqual({ silent: true, clean: false });
  });
});
