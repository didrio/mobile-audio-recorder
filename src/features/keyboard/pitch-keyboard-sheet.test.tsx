import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { prepareKeyboard, startNote, stopNote } from '@/features/audio/audio-engine';
import { useKeyboardSettingsStore } from '@/features/settings/keyboard-settings-store';

import { PitchKeyboardSheet } from './pitch-keyboard-sheet';

jest.mock('@/features/audio/audio-engine', () => ({
  prepareKeyboard: jest.fn(() => Promise.resolve()),
  startNote: jest.fn(() => ({ id: 'note' })),
  stopNote: jest.fn(),
}));

async function renderKeyboard() {
  await render(
    <GestureHandlerRootView>
      <PitchKeyboardSheet />
    </GestureHandlerRootView>,
  );
  // The keys are laid out once the keyboard knows its size (one octave plus the next C on a phone).
  await fireEvent(screen.getByTestId('keyboard-keys'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 200 } },
  });
}

describe('PitchKeyboardSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.mocked(startNote).mockClear();
    jest.mocked(stopNote).mockClear();
    useKeyboardSettingsStore.setState({ keyboardStart: 60, keyboardVolume: 0.5 });
  });
  afterEach(() => jest.useRealTimers());

  it('gets the audio ready and shows the keys from middle C', async () => {
    await renderKeyboard();

    expect(prepareKeyboard).toHaveBeenCalled();
    expect(screen.getByText('C4 – D5')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'C4' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'F♯4' })).toBeOnTheScreen();
  });

  it('plays a key for a screen reader at the keyboard volume, then lets it go', async () => {
    await renderKeyboard();

    await fireEvent(screen.getByRole('button', { name: 'A4' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(startNote).toHaveBeenCalledWith(440, 0.5);
    jest.advanceTimersByTime(1000);
    expect(stopNote).toHaveBeenCalledWith({ id: 'note' });
  });

  it('moves by octaves within range, and remembers where it was left', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderKeyboard();

    await user.press(screen.getByRole('button', { name: 'Octave down' }));
    expect(screen.getByText('C3 – D4')).toBeOnTheScreen();
    expect(useKeyboardSettingsStore.getState().keyboardStart).toBe(48);

    // Down to C1, the lowest start.
    await user.press(screen.getByRole('button', { name: 'Octave down' }));
    await user.press(screen.getByRole('button', { name: 'Octave down' }));
    expect(screen.getByText('C1 – D2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Octave down' })).toBeDisabled();
  });
});
