import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rntlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Appearance } from 'react-native';

import { storage } from '@/lib/storage';

import { useAppearanceStore } from './appearance-store';
import { useRecordingSettingsStore } from './recording-settings-store';
import { SettingsScreen } from './settings-screen';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@/features/audio/take-files', () => ({ recordingsSizeBytes: () => 5 * 1024 * 1024 }));

const render = (element: ReactElement) =>
  rntlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {element}
    </QueryClientProvider>,
  );

describe('SettingsScreen', () => {
  it('shows the storage used by recordings', async () => {
    await render(<SettingsScreen />);

    expect(await screen.findByText('5.0 MB')).toBeOnTheScreen();
  });

  beforeEach(() => {
    useAppearanceStore.setState({ preference: 'system' });
    useRecordingSettingsStore.setState({ latencyOffsetMs: 0, preRollSeconds: 2, preRollBars: 1 });
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
