import { fireEvent, render, screen } from '@testing-library/react-native';
import { Appearance } from 'react-native';

import { storage } from '@/lib/storage';

import { useAppearanceStore } from './appearance-store';
import { useRecordingSettingsStore } from './recording-settings-store';
import { SettingsScreen } from './settings-screen';

describe('SettingsScreen', () => {
  beforeEach(() => {
    useAppearanceStore.setState({ preference: 'system' });
    useRecordingSettingsStore.setState({ latencyOffsetMs: 0 });
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

  it('shows app version info', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('Version')).toBeOnTheScreen();
    expect(screen.getByText('Variant')).toBeOnTheScreen();
  });
});
