import { act, renderHook } from '@testing-library/react-native';
import type { AudioDevicesInfo } from 'react-native-audio-api';

import * as engine from '@/features/audio/audio-engine';
import { useAudioRouteStore } from '@/features/audio/audio-route-store';
import { useInputDevicesStore } from '@/features/settings/input-devices-store';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import type { RouteLatency } from '@/lib/audio-input';

import { useMonitoring } from './use-monitoring';

jest.mock('@/features/audio/audio-engine', () => ({
  MONO_INPUT: { channels: 1, channel: 0 },
  setMonitor: jest.fn(),
  setMonitorLevel: jest.fn(),
  liveMonitorLatency: jest.fn(() => null),
  configureSession: jest.fn(),
  setInputPreference: jest.fn(() => Promise.resolve()),
  applyInputPreference: jest.fn(() => Promise.resolve(null)),
}));

const setMonitor = jest.mocked(engine.setMonitor);
const liveMonitorLatency = jest.mocked(engine.liveMonitorLatency);

const WIRED_LATENCY: RouteLatency = { input: 0.001, output: 0.002, sampleRate: 48_000 };

function route(
  category: string,
  options: { channelCount?: number; latency?: RouteLatency | null } = {},
) {
  const devices: AudioDevicesInfo = {
    availableInputs: [{ id: 'mic', name: 'iPhone Microphone', category: 'MicrophoneBuiltIn' }],
    availableOutputs: [],
    currentInputs: [{ id: 'mic', name: 'iPhone Microphone', category: 'MicrophoneBuiltIn' }],
    currentOutputs: [{ id: 'out', name: category, category }],
  };
  useAudioRouteStore.setState({
    devices,
    inputInfo: {
      channelCount: options.channelCount ?? 1,
      gainSettable: false,
      gain: 1,
      latency: options.latency === undefined ? WIRED_LATENCY : options.latency,
    },
    measuredMonitorLatency: null,
  });
}

describe('useMonitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRecordingSettingsStore.setState({ monitoring: true, monitorLevel: 0.5 });
    route('Headphones');
  });

  it('plays the input in the headphones while the mic is open, and stops when it closes', async () => {
    const { rerender } = await renderHook(({ open }: { open: boolean }) => useMonitoring(open), {
      initialProps: { open: true },
    });
    expect(setMonitor).toHaveBeenLastCalledWith({ level: 0.5, input: { channels: 1, channel: 0 } });

    await rerender({ open: false });
    expect(setMonitor).toHaveBeenLastCalledWith(null);
  });

  it('hears the channel chosen for a multi-channel input (T38)', async () => {
    route('USBAudio', { channelCount: 2 });
    useInputDevicesStore.setState({
      channelByDevice: { 'MicrophoneBuiltIn:iPhone Microphone': 1 },
    });
    await renderHook(() => useMonitoring(true));
    expect(setMonitor).toHaveBeenLastCalledWith({ level: 0.5, input: { channels: 2, channel: 1 } });
    useInputDevicesStore.setState({ channelByDevice: {} });
  });

  it('stays off while switched off in Settings', async () => {
    useRecordingSettingsStore.setState({ monitoring: false });
    await renderHook(() => useMonitoring(true));
    expect(setMonitor).not.toHaveBeenCalled();
  });

  it('never monitors on the speaker, and stops at once when the headphones are unplugged', async () => {
    await renderHook(() => useMonitoring(true));
    expect(setMonitor).toHaveBeenCalledTimes(1);

    await act(() => route('Speaker'));
    expect(setMonitor).toHaveBeenLastCalledWith(null);
  });

  it('refuses Bluetooth headphones (too much delay)', async () => {
    route('BluetoothA2DPOutput', { latency: { input: 0.01, output: 0.16, sampleRate: 48_000 } });
    await renderHook(() => useMonitoring(true));
    expect(setMonitor).not.toHaveBeenCalled();
  });

  it('follows the level live without reconnecting', async () => {
    await renderHook(() => useMonitoring(true));
    await act(() => useRecordingSettingsStore.setState({ monitorLevel: 0.9 }));
    expect(engine.setMonitorLevel).toHaveBeenLastCalledWith(0.9);
    expect(setMonitor).toHaveBeenCalledTimes(1);
  });

  it('measures the live round trip, and a too-slow one switches it off for that output', async () => {
    jest.useFakeTimers();
    liveMonitorLatency.mockReturnValue(0.05);
    await renderHook(() => useMonitoring(true));

    await act(() => jest.advanceTimersByTime(1000));
    expect(useAudioRouteStore.getState().measuredMonitorLatency).toEqual({
      output: 'Headphones:Headphones',
      seconds: 0.05,
    });
    expect(setMonitor).toHaveBeenLastCalledWith(null);
    jest.useRealTimers();
  });
});
