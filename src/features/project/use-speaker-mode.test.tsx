import { renderHook } from '@testing-library/react-native';

import { useExperimentalSettingsStore } from '@/features/settings/experimental-settings-store';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import * as echoCanceller from '@/lib/echo-canceller';

import { useSpeakerRecording } from './use-speaker-mode';

jest.mock('@/features/audio/audio-route-store', () => ({
  ...jest.requireActual('@/features/audio/audio-route-store'),
  useHeadphones: () => false,
}));

describe('useSpeakerRecording', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    useExperimentalSettingsStore.setState({ speakerMode: true });
    useRecordingSettingsStore.setState({ silentRecording: false });
  });

  it('cleans takes recorded without headphones when Speaker mode is on', async () => {
    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current).toEqual({ silent: false, clean: true });
  });

  it('cleans nothing with Speaker mode off', async () => {
    useExperimentalSettingsStore.setState({ speakerMode: false });

    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current.clean).toBe(false);
  });

  it('cleans nothing where the native module is missing', async () => {
    jest.replaceProperty(echoCanceller, 'isEchoCancellerAvailable', false);

    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current.clean).toBe(false);
  });

  it('records in silence instead of cleaning when silent recording is on', async () => {
    useRecordingSettingsStore.setState({ silentRecording: true });

    const { result } = await renderHook(() => useSpeakerRecording());

    expect(result.current).toEqual({ silent: true, clean: false });
  });
});
