import { fireEvent, render as rntlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAudioRouteStore } from '@/features/audio/audio-route-store';
import { setInputGain } from '@/lib/audio-input';

import { useInputDevicesStore } from './input-devices-store';
import { InputScreen } from './input-screen';
import { useRecordingSettingsStore } from './recording-settings-store';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const mic = { id: 'mic', name: 'iPhone Microphone', category: 'MicrophoneBuiltIn' };
const scarlett = { id: 'usb-1', name: 'Scarlett 2i2', category: 'USBAudio' };
const headset = { id: 'bt-1', name: 'AirPods Pro', category: 'BluetoothHFP' };

const render = (element: ReactElement) =>
  rntlRender(<GestureHandlerRootView>{element}</GestureHandlerRootView>);

function route(options: {
  available?: (typeof mic)[];
  current?: typeof mic | null;
  channelCount?: number;
  gainSettable?: boolean;
  gain?: number;
}) {
  useAudioRouteStore.setState({
    devices: {
      availableInputs: options.available ?? [mic, scarlett],
      availableOutputs: [],
      currentInputs: options.current === null ? [] : [options.current ?? mic],
      currentOutputs: [],
    },
    inputInfo: {
      channelCount: options.channelCount ?? 1,
      gainSettable: options.gainSettable ?? false,
      gain: options.gain ?? 0.5,
    },
  });
}

describe('InputScreen', () => {
  beforeEach(() => {
    useInputDevicesStore.setState({ preferredInput: null, channelByDevice: {}, gainByDevice: {} });
    useRecordingSettingsStore.setState({ bluetoothPhoneMic: true });
    route({});
  });

  it('lists the inputs with Automatic picked and the one in use marked', async () => {
    await render(<InputScreen />);

    expect(screen.getByRole('button', { name: /Automatic/ })).toBeSelected();
    expect(screen.getByText('In use')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Scarlett 2i2/ })).not.toBeSelected();
  });

  it('remembers a picked input, and goes back to Automatic', async () => {
    await render(<InputScreen />);

    await fireEvent.press(screen.getByRole('button', { name: /Scarlett 2i2/ }));
    expect(useInputDevicesStore.getState().preferredInput).toEqual(scarlett);
    expect(screen.getByRole('button', { name: /Scarlett 2i2/ })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: /Automatic/ }));
    expect(useInputDevicesStore.getState().preferredInput).toBeNull();
  });

  it('keeps showing a picked input that is unplugged', async () => {
    useInputDevicesStore.setState({ preferredInput: scarlett });
    route({ available: [mic] });
    await render(<InputScreen />);

    expect(screen.getByText('Not connected')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Scarlett 2i2/ })).toBeSelected();
  });

  it('hides Bluetooth mics while the phone mic is used with Bluetooth', async () => {
    route({ available: [mic, headset] });
    await render(<InputScreen />);
    expect(screen.queryByText('AirPods Pro')).not.toBeOnTheScreen();
  });

  it('offers Bluetooth mics when that setting is off', async () => {
    useRecordingSettingsStore.setState({ bluetoothPhoneMic: false });
    route({ available: [mic, headset] });
    await render(<InputScreen />);
    expect(screen.getByText('AirPods Pro')).toBeOnTheScreen();
  });

  it('picks the channel of a two-input interface, remembered per device', async () => {
    route({ current: scarlett, channelCount: 2 });
    await render(<InputScreen />);

    expect(screen.getByRole('radio', { name: 'Input 1' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Input 2' }));

    expect(useInputDevicesStore.getState().channelByDevice).toEqual({ 'USBAudio:Scarlett 2i2': 1 });
    expect(screen.getByRole('radio', { name: 'Input 2' })).toBeChecked();
  });

  it('has no channel choice for a mono input', async () => {
    await render(<InputScreen />);
    expect(screen.queryByRole('radio', { name: 'Input 1' })).not.toBeOnTheScreen();
  });

  it('shows the gain slider only when the input gain can be set, and applies it on release', async () => {
    await render(<InputScreen />);
    expect(screen.queryByRole('adjustable', { name: 'Input gain' })).not.toBeOnTheScreen();

    route({ gainSettable: true, gain: 0.5 });
    jest.mocked(setInputGain).mockResolvedValueOnce(true);
    await render(<InputScreen />);
    const slider = screen.getByRole('adjustable', { name: 'Input gain' });
    expect(slider).toHaveAccessibilityValue({ text: '50%' });

    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(setInputGain).toHaveBeenCalledWith(0.55);
    expect(useInputDevicesStore.getState().gainByDevice).toEqual({
      'MicrophoneBuiltIn:iPhone Microphone': 0.55,
    });
  });
});
