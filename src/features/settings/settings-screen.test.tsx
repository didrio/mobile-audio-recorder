import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rntlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAudioRouteStore } from '@/features/audio/audio-route-store';
import * as echoCanceller from '@/lib/echo-canceller';
import { storage } from '@/lib/storage';

import { useAppearanceStore } from './appearance-store';
import { useInputDevicesStore } from './input-devices-store';
import { useKeyboardSettingsStore } from './keyboard-settings-store';
import { useRecordingSettingsStore } from './recording-settings-store';
import { SettingsScreen } from './settings-screen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/features/audio/take-files', () => ({ recordingsSizeBytes: () => 5 * 1024 * 1024 }));
jest.mock('@/features/projects/trash-repo', () => ({
  deletedRecordingsBytes: () => Promise.resolve(1024 * 1024),
}));

const devices = {
  availableInputs: [],
  availableOutputs: [],
  currentInputs: [],
  currentOutputs: [],
};
const airPods = { id: 'bt-1', name: 'AirPods Pro', category: 'BluetoothA2DPOutput' };
const scarlett = { id: 'usb-1', name: 'Scarlett 2i2', category: 'USBAudio' };

const render = (element: ReactElement) =>
  rntlRender(
    <GestureHandlerRootView>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {element}
      </QueryClientProvider>
    </GestureHandlerRootView>,
  );

describe('SettingsScreen', () => {
  it('changes the pitch keyboard volume (saved when the slider is let go)', async () => {
    useKeyboardSettingsStore.setState({ keyboardVolume: 1 });
    await render(<SettingsScreen />);
    const slider = screen.getByRole('adjustable', { name: 'Keyboard volume' });

    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });

    expect(useKeyboardSettingsStore.getState().keyboardVolume).toBeLessThan(1);
    expect(slider).toHaveAccessibilityValue({ text: '−1.0 dB' });
  });

  it('shows the storage used by recordings, with Recently Deleted counted separately', async () => {
    await render(<SettingsScreen />);

    expect(await screen.findByText('4.0 MB')).toBeOnTheScreen();
    expect(screen.getByText('1.0 MB')).toBeOnTheScreen();
  });

  beforeEach(() => {
    useAppearanceStore.setState({ preference: 'system' });
    useAudioRouteStore.setState({
      devices,
      inputInfo: { channelCount: 1, gainSettable: false, gain: 1, latency: null },
      measuredMonitorLatency: null,
    });
    useInputDevicesStore.setState({ preferredInput: null, channelByDevice: {}, gainByDevice: {} });
    mockPush.mockClear();
    useRecordingSettingsStore.setState({
      latencyOffsetsMs: { speaker: 0, wired: 0, bluetooth: 0, usb: 0 },
      bluetoothPhoneMic: true,
      monitoring: false,
      monitorLevel: 1,
      bitDepth: 24,
      preRollSeconds: 2,
      preRollBars: 1,
      speakerMode: false,
      cleanupStrength: 'light',
    });
  });

  it('hides Speaker mode while it is shelved', async () => {
    const shelved = jest.replaceProperty(echoCanceller, 'SPEAKER_MODE_ENABLED', false);
    useRecordingSettingsStore.setState({ speakerMode: true });
    await render(<SettingsScreen />);
    shelved.restore();

    expect(screen.queryByRole('switch', { name: 'Speaker mode' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('radiogroup', { name: 'Cleanup strength' })).not.toBeOnTheScreen();
  });

  it('shows the current appearance preference', async () => {
    await render(<SettingsScreen />);

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('changes and persists the appearance preference', async () => {
    const setColorScheme = jest.spyOn(Appearance, 'setColorScheme');
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(useAppearanceStore.getState().preference).toBe('dark');
    expect(storage.getString('settings.appearance')).toContain('"preference":"dark"');
    // Not applied by the screen itself — `initAppearance()` (root layout) owns that side effect.
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('changes and persists the latency offset in 5 ms steps', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('0 ms')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Increase latency offset' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Increase latency offset' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease latency offset' }));

    expect(screen.getByText('5 ms')).toBeOnTheScreen();
    expect(useRecordingSettingsStore.getState().latencyOffsetsMs.speaker).toBe(5);
    expect(storage.getString('settings.recording')).toContain('"speaker":5');
  });

  it("tunes the latency offset of the output that's playing", async () => {
    useAudioRouteStore.setState({ devices: { ...devices, currentOutputs: [airPods] } });
    useRecordingSettingsStore.setState({
      latencyOffsetsMs: { speaker: 0, wired: 0, bluetooth: 120, usb: 0 },
    });
    await render(<SettingsScreen />);

    expect(screen.getByText('For Bluetooth')).toBeOnTheScreen();
    expect(screen.getByText('120 ms')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Increase latency offset' }));
    expect(useRecordingSettingsStore.getState().latencyOffsetsMs).toEqual({
      speaker: 0,
      wired: 0,
      bluetooth: 125,
      usb: 0,
    });
  });

  it('shows the current input (with its channel) and output, and opens the input picker', async () => {
    useAudioRouteStore.setState({
      devices: { ...devices, currentInputs: [scarlett], currentOutputs: [airPods] },
      inputInfo: { channelCount: 2, gainSettable: false, gain: 1, latency: null },
    });
    useInputDevicesStore.setState({ channelByDevice: { 'USBAudio:Scarlett 2i2': 1 } });
    await render(<SettingsScreen />);

    expect(screen.getByText('Scarlett 2i2 · Input 2')).toBeOnTheScreen();
    expect(screen.getByText('AirPods Pro')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Input/ }));
    expect(mockPush).toHaveBeenCalledWith('/settings/input');
  });

  it('names the remembered input before iOS reports one', async () => {
    useAudioRouteStore.setState({ devices });
    useInputDevicesStore.setState({ preferredInput: scarlett });
    await render(<SettingsScreen />);
    expect(screen.getByText('Scarlett 2i2')).toBeOnTheScreen();
  });

  it('does not offer Hear yourself on the speaker', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('switch', { name: 'Hear yourself' })).toBeDisabled();
    expect(screen.getByText(/Needs headphones or an audio interface/)).toBeOnTheScreen();
  });

  it('offers Hear yourself on wired headphones with its delay, and a level once on', async () => {
    const headphones = { id: 'wired', name: 'Headphones', category: 'Headphones' };
    useAudioRouteStore.setState({
      devices: { ...devices, currentOutputs: [headphones] },
      inputInfo: {
        channelCount: 1,
        gainSettable: false,
        gain: 1,
        latency: { input: 0.001, output: 0.002, sampleRate: 48_000 },
      },
    });
    await render(<SettingsScreen />);

    expect(screen.getByText('Delay ~11 ms (Wired headphones).')).toBeOnTheScreen();
    const toggle = screen.getByRole('switch', { name: 'Hear yourself' });
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('adjustable', { name: 'Hear yourself level' })).toBeNull();

    await fireEvent(toggle, 'valueChange', true);

    expect(useRecordingSettingsStore.getState().monitoring).toBe(true);
    expect(screen.getByRole('adjustable', { name: 'Hear yourself level' })).toBeOnTheScreen();
  });

  it('refuses Hear yourself on Bluetooth (too much delay)', async () => {
    useAudioRouteStore.setState({ devices: { ...devices, currentOutputs: [airPods] } });
    useRecordingSettingsStore.setState({ monitoring: true });
    await render(<SettingsScreen />);

    const toggle = screen.getByRole('switch', { name: 'Hear yourself' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Too much delay to play along to on Bluetooth/)).toBeOnTheScreen();
  });

  it('tells interface users about direct monitoring', async () => {
    useAudioRouteStore.setState({ devices: { ...devices, currentOutputs: [scarlett] } });
    await render(<SettingsScreen />);
    expect(screen.getByText(/does its own direct monitoring\? Leave this off/)).toBeOnTheScreen();
  });

  it('switches the Bluetooth mic setting and explains the trade-off', async () => {
    await render(<SettingsScreen />);
    const toggle = screen.getByRole('switch', {
      name: "Use the phone's mic with Bluetooth headphones",
    });
    expect(toggle).toBeChecked();

    await fireEvent(toggle, 'valueChange', false);

    expect(useRecordingSettingsStore.getState().bluetoothPhoneMic).toBe(false);
    expect(screen.getByText(/drops to call quality/)).toBeOnTheScreen();
  });

  it('changes the recording bit depth', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('radio', { name: '24-bit' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: '16-bit' }));

    expect(useRecordingSettingsStore.getState().bitDepth).toBe(16);
    expect(storage.getString('settings.recording')).toContain('"bitDepth":16');
  });

  it('stops at the latency offset limits', async () => {
    useRecordingSettingsStore.setState({
      latencyOffsetsMs: { speaker: -200, wired: 0, bluetooth: 0, usb: 0 },
    });
    await render(<SettingsScreen />);

    expect(screen.getByRole('button', { name: 'Decrease latency offset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase latency offset' })).toBeEnabled();
  });

  it('turns speaker mode on and offers the cleanup strength', async () => {
    await render(<SettingsScreen />);

    expect(screen.getByRole('switch', { name: 'Speaker mode' })).not.toBeChecked();
    expect(screen.queryByLabelText('Cleanup strength')).toBeNull();
    await fireEvent(screen.getByRole('switch', { name: 'Speaker mode' }), 'valueChange', true);

    expect(storage.getString('settings.recording')).toContain('"speakerMode":true');
    expect(screen.getByLabelText('Cleanup strength')).toBeOnTheScreen();
  });

  it('changes and persists the pre-roll length (2 s by default)', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('radio', { name: '2 s' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: '4 s' }));

    expect(screen.getByRole('radio', { name: '4 s' })).toBeChecked();
    expect(useRecordingSettingsStore.getState().preRollSeconds).toBe(4);
    expect(storage.getString('settings.recording')).toContain('"preRollSeconds":4');
  });

  it('changes and persists the pre-roll length for ideas with the grid on (1 bar by default)', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: '2 bars' }));

    expect(screen.getByRole('radio', { name: '2 bars' })).toBeChecked();
    expect(useRecordingSettingsStore.getState().preRollBars).toBe(2);
    expect(storage.getString('settings.recording')).toContain('"preRollBars":2');
  });

  it('shows app version info', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('Version')).toBeOnTheScreen();
    expect(screen.getByText('Variant')).toBeOnTheScreen();
  });
});
