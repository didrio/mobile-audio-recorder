import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { act } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Project } from '@/features/projects/projects-repo';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';

import { testProject, testTrack } from './edit-test-data';
import { openIdea, useEditorStore } from './editor-store';
import { IdeaSettingsSheet } from './idea-settings-sheet';
import { useSettingsSheetStore } from './settings-sheet-store';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/features/audio/audio-engine', () => ({
  forgetTakes: jest.fn(),
  setMetronome: jest.fn(),
}));

jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
  setArmedTrack: jest.fn(),
  setPreRoll: jest.fn(),
  setMetronome: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));

const { getProject, saveChanges, deleteUnusedTakes } = jest.requireMock<
  typeof import('@/features/projects/projects-repo')
>('@/features/projects/projects-repo');

const project: Project = testProject([testTrack('a', 0)]);

async function openSheet() {
  jest.mocked(getProject).mockResolvedValue(project);
  jest.mocked(saveChanges).mockResolvedValue();
  jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
  await act(async () => {
    await openIdea('p1');
  });
  return render(
    <GestureHandlerRootView>
      <IdeaSettingsSheet />
    </GestureHandlerRootView>,
  );
}

const savedSettings = () =>
  jest
    .mocked(saveChanges)
    .mock.calls.map(([, changes]) => changes[0])
    .map((change) => (change && change.table === 'projects' ? change.after : null));

describe('IdeaSettingsSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.mocked(saveChanges).mockReset();
    mockPush.mockClear();
    useSettingsSheetStore.setState({ tab: 'idea' });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens on the Idea tab: tempo, time signature and grid (the name is in the title menu)', async () => {
    await openSheet();

    expect(screen.getByRole('radio', { name: 'Idea' })).toBeChecked();
    expect(screen.queryByLabelText('Idea name')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Tempo in beats per minute')).toHaveDisplayValue('120');
    expect(screen.getByRole('radio', { name: '4/4' })).toBeChecked();
    expect(screen.getByLabelText('Grid')).toHaveProp('value', false);
    expect(screen.getByText(/moves only the grid, not the audio/)).toBeOnTheScreen();
  });

  it('switches to the Recording tab: app-wide settings, remembered for next time', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openSheet();

    await user.press(screen.getByRole('radio', { name: 'Recording' }));

    expect(screen.getByText(/apply to all your ideas/)).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Hear yourself' })).toBeOnTheScreen();
    expect(screen.getByText('Output')).toBeOnTheScreen();
    expect(screen.getByText('Latency offset')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tempo in beats per minute')).not.toBeOnTheScreen();
    expect(useSettingsSheetStore.getState().tab).toBe('recording');

    await fireEvent(
      screen.getByRole('switch', { name: 'Silent while recording' }),
      'valueChange',
      !useRecordingSettingsStore.getState().silentRecording,
    );
    expect(useRecordingSettingsStore.getState().silentRecording).toBe(true);
  });

  it('opens the input picker from the Recording tab', async () => {
    useSettingsSheetStore.setState({ tab: 'recording' });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openSheet();

    await user.press(screen.getByText('Input'));

    expect(mockPush).toHaveBeenCalledWith('/input-picker');
  });

  it('changes the time signature straight away', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openSheet();

    await user.press(screen.getByRole('radio', { name: '6/8' }));

    expect(useEditorStore.getState().project).toMatchObject({ beatsPerBar: 6, beatUnit: 8 });
    expect(screen.getByRole('radio', { name: '6/8' })).toBeChecked();
  });

  it('turns the grid on and off with the switch', async () => {
    await openSheet();

    await fireEvent(screen.getByLabelText('Grid'), 'valueChange', true);
    expect(useEditorStore.getState().project?.grid).toBe(true);

    await fireEvent(screen.getByLabelText('Grid'), 'valueChange', false);
    expect(useEditorStore.getState().project?.grid).toBe(false);
  });

  it('saves a run of stepper presses as one step, and turns the grid on', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openSheet();

    await user.press(screen.getByRole('button', { name: 'Faster' }));
    await user.press(screen.getByRole('button', { name: 'Faster' }));
    expect(screen.getByLabelText('Tempo in beats per minute')).toHaveDisplayValue('122');
    expect(saveChanges).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(useEditorStore.getState().project).toMatchObject({ bpm: 122, grid: true });
    expect(useEditorStore.getState().history.past).toHaveLength(1);
    expect(savedSettings()).toEqual([expect.objectContaining({ bpm: 122, grid: true })]);
  });

  it('commits a typed tempo, clamped to the range', async () => {
    await openSheet();

    const input = screen.getByLabelText('Tempo in beats per minute');
    await fireEvent.changeText(input, '300');
    await fireEvent(input, 'endEditing');

    expect(input).toHaveDisplayValue('240');
    expect(useEditorStore.getState().project?.bpm).toBe(240);
  });

  it('sets the tempo from taps', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openSheet();

    jest.setSystemTime(10_000);
    await user.press(screen.getByRole('button', { name: 'Tap tempo' }));
    jest.setSystemTime(10_500);
    await user.press(screen.getByRole('button', { name: 'Tap tempo' }));

    // Half a second apart (plus the few ms a press takes): about 120 BPM.
    const tapped = Number(screen.getByLabelText('Tempo in beats per minute').props.value);
    expect(tapped).toBeGreaterThanOrEqual(117);
    expect(tapped).toBeLessThanOrEqual(123);
  });

  it('keeps a pending tempo change when the sheet closes', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { unmount } = await openSheet();

    await user.press(screen.getByRole('button', { name: 'Slower' }));
    await unmount();

    expect(useEditorStore.getState().project?.bpm).toBe(119);
  });

  it('saves a metronome volume step as one undoable edit', async () => {
    await openSheet();
    const slider = screen.getByRole('adjustable', { name: 'Metronome volume' });
    expect(screen.getByText('0.0 dB')).toBeOnTheScreen();

    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });

    const volume = useEditorStore.getState().project!.metronomeVolume;
    expect(volume).toBeLessThan(1);
    expect(savedSettings()).toEqual([expect.objectContaining({ metronomeVolume: volume })]);
    expect(screen.getByText('−1.0 dB')).toBeOnTheScreen();
  });

  it('picks the metronome output as an undoable edit; Visual hides the volume', async () => {
    const user = userEvent.setup();
    await openSheet();
    expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked();

    await user.press(screen.getByRole('radio', { name: 'Visual' }));

    expect(useEditorStore.getState().project?.metronomeOutput).toBe('visual');
    expect(savedSettings()).toEqual([expect.objectContaining({ metronomeOutput: 'visual' })]);
    expect(screen.queryByRole('adjustable', { name: 'Metronome volume' })).not.toBeOnTheScreen();
  });
});
