import { useEffect } from 'react';
import { AudioManager, type AudioDevicesInfo } from 'react-native-audio-api';
import { create } from 'zustand';

import { useInputDevicesStore } from '@/features/settings/input-devices-store';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import { getInputInfo, setInputGain, type InputInfo } from '@/lib/audio-input';

import {
  configureSession,
  applyInputPreference,
  MONO_INPUT,
  setInputPreference,
  type InputSelection,
} from './audio-engine';
import {
  currentInput,
  currentOutput,
  deviceKey,
  headphonesConnected,
  inputChannel,
  outputRouteOf,
  type OutputRoute,
} from './audio-route';
import { estimateMonitorLatency, monitorStatus, type MonitorStatus } from './monitoring';

const NO_DEVICES: AudioDevicesInfo = {
  availableInputs: [],
  availableOutputs: [],
  currentInputs: [],
  currentOutputs: [],
};

type AudioRouteState = {
  /** What `AudioManager.getDevicesInfo()` reported last. */
  devices: AudioDevicesInfo;
  /** The current input's channels and gain (`@/lib/audio-input`). */
  inputInfo: InputInfo;
  /** Hear yourself's round trip as measured live (T39), for the output it was measured on. */
  measuredMonitorLatency: { output: string; seconds: number } | null;
};

/**
 * The live audio route (T38): devices, the current input's details. Kept fresh by
 * `useAudioRouteSync` (mounted once in the root layout); read with the selectors below.
 */
export const useAudioRouteStore = create<AudioRouteState>()(() => ({
  devices: NO_DEVICES,
  inputInfo: { channelCount: 1, gainSettable: false, gain: 1, latency: null },
  measuredMonitorLatency: null,
}));

/** The output route playing now (for its latency offset). */
export function currentOutputRoute(
  state: AudioRouteState = useAudioRouteStore.getState(),
): OutputRoute {
  const output = currentOutput(state.devices);
  return output ? outputRouteOf(output.category) : 'speaker';
}

/** Which input channels to open and record now: all of the input's, keeping the chosen one. */
export function currentInputSelection(
  state: AudioRouteState = useAudioRouteStore.getState(),
  channelByDevice: Record<string, number> = useInputDevicesStore.getState().channelByDevice,
): InputSelection {
  const { channelCount } = state.inputInfo;
  const input = currentInput(state.devices);
  if (channelCount <= 1 || !input) return MONO_INPUT;
  const remembered = channelByDevice[deviceKey(input)];
  return { channels: channelCount, channel: inputChannel(remembered, channelCount) };
}

/** Key of the output playing now (`deviceKey`), or `null` when none is reported. */
export function currentOutputKey(
  state: AudioRouteState = useAudioRouteStore.getState(),
): string | null {
  const output = currentOutput(state.devices);
  return output ? deviceKey(output) : null;
}

/**
 * Hear yourself's round trip on the current output (T39): the live measurement when there is one for
 * this output, else the estimate from what the system reports; `null` when neither is known.
 */
export function currentMonitorLatency(
  state: AudioRouteState = useAudioRouteStore.getState(),
): number | null {
  const measured = state.measuredMonitorLatency;
  if (measured && measured.output === currentOutputKey(state)) return measured.seconds;
  return estimateMonitorLatency(state.inputInfo.latency);
}

/** Whether Hear yourself is offered and on, the delay, and the route (Settings and the editor). */
export function useMonitorStatus(): {
  status: MonitorStatus;
  latency: number | null;
  route: OutputRoute;
} {
  const enabled = useRecordingSettingsStore((state) => state.monitoring);
  const headphones = useHeadphones();
  const route = useAudioRouteStore((state) => currentOutputRoute(state));
  const latency = useAudioRouteStore((state) => currentMonitorLatency(state));
  return { status: monitorStatus({ enabled, headphones, route, latency }), latency, route };
}

/** Whether headphones are connected, re-checked whenever the audio route changes. */
export function useHeadphones(): boolean {
  return useAudioRouteStore((state) => headphonesConnected(state.devices));
}

/** Re-reads the devices and the current input's details into the store. */
export async function refreshAudioRoute(): Promise<void> {
  try {
    const devices = (await applyInputPreference()) ?? (await AudioManager.getDevicesInfo());
    const input = currentInput(devices);
    const inputInfo = await getInputInfo(input?.id ?? null);
    useAudioRouteStore.setState({ devices, inputInfo });

    const output = currentOutput(devices);
    if (output)
      useRecordingSettingsStore.getState().claimLegacyOffset(outputRouteOf(output.category));

    // Put back the gain remembered for this input (the system may reset it on a route change).
    const gain = input && useInputDevicesStore.getState().gainByDevice[deviceKey(input)];
    if (
      inputInfo.gainSettable &&
      gain !== undefined &&
      gain !== null &&
      Math.abs(gain - inputInfo.gain) > 0.005
    ) {
      if (await setInputGain(gain)) {
        useAudioRouteStore.setState({ inputInfo: { ...inputInfo, gain } });
      }
    }
  } catch {
    // Leave the last known route; the next change tries again.
  }
}

/**
 * Keeps the route store fresh (at start and on every route change) and hands the input and
 * Bluetooth choices from Settings to the audio engine. Mount once, in the root layout.
 */
export function useAudioRouteSync() {
  const bluetoothPhoneMic = useRecordingSettingsStore((state) => state.bluetoothPhoneMic);
  const preferredInput = useInputDevicesStore((state) => state.preferredInput);

  useEffect(() => {
    configureSession({ bluetoothPhoneMic });
    void refreshAudioRoute();
  }, [bluetoothPhoneMic]);

  useEffect(() => {
    void setInputPreference(preferredInput).then(refreshAudioRoute);
  }, [preferredInput]);

  useEffect(() => {
    void refreshAudioRoute();
    const subscription = AudioManager.addSystemEventListener('routeChange', () => {
      void refreshAudioRoute();
    });
    return () => subscription.remove();
  }, []);
}
