import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rntlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { storage } from '@/lib/storage';

import { useAppearanceStore } from './appearance-store';
import { useKeyboardSettingsStore } from './keyboard-settings-store';
import { useRecordingSettingsStore } from './recording-settings-store';
import { SettingsScreen } from './settings-screen';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@/features/audio/take-files', () => ({ recordingsSizeBytes: () => 5 * 1024 * 1024 }));

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

  it('shows the storage used by recordings', async () => {
    await render(<SettingsScreen />);

    expect(await screen.findByText('5.0 MB')).toBeOnTheScreen();
  });

  beforeEach(() => {
    useAppearanceStore.setState({ preference: 'system' });
    useRecordingSettingsStore.setState({
      latencyOffsetMs: 0,
      preRollSeconds: 2,
      preRollBars: 1,
      speakerMode: false,
      cleanupStrength: 'light',
    });
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
    expect(storage.getString('settings.recording')).toContain('"latencyOffsetMs":5');
  });

  it('stops at the latency offset limits', async () => {
    useRecordingSettingsStore.setState({ latencyOffsetMs: -200 });
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
