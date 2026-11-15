import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Project } from '@/features/projects/projects-repo';

import { ClipOptionsSheet } from './clip-options-sheet';
import { testClip, testProject, testTrack } from './edit-test-data';
import { closeIdea, openIdea, undo, useEditorStore } from './editor-store';
import { registerTransportLink } from './transport-link';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'c2', projectId: 'p1' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));
jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
}));

const { getProject, saveChanges, deleteUnusedTakes } = jest.requireMock<
  typeof import('@/features/projects/projects-repo')
>('@/features/projects/projects-repo');

// Take (20 s) shown at 6…10 from 4 s in, so the whole take would span 2…22; c1 ends at 2.
const project: Project = {
  ...testProject([
    testTrack('a', 0, [testClip('c1', 'a', 0, 2), { ...testClip('c2', 'a', 6, 4), offset: 4 }]),
  ]),
  takes: {
    take1: {
      id: 'take1',
      projectId: 'p1',
      path: 'takes/take1.wav',
      duration: 20,
      sampleRate: 48000,
      channels: 1,
      createdAt: 0,
    },
  },
};

const clip = () =>
  useEditorStore.getState().project?.tracks[0]?.clips.find((candidate) => candidate.id === 'c2');

describe('ClipOptionsSheet', () => {
  const replay = jest.fn();
  let unregister: () => void = () => {};

  beforeEach(async () => {
    jest.mocked(getProject).mockResolvedValue(project);
    jest.mocked(saveChanges).mockClear().mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
    replay.mockClear();
    mockBack.mockClear();
    unregister = registerTransportLink({ playheadTime: () => 0, seek: jest.fn(), replay });
    await act(() => openIdea('p1'));
    await render(
      <GestureHandlerRootView>
        <ClipOptionsSheet />
      </GestureHandlerRootView>,
    );
  });

  afterEach(async () => {
    unregister();
    await act(() => closeIdea());
  });

  it('shows the clip and its gain, and steps the gain as one undo step that playback picks up', async () => {
    expect(screen.getByText('Track 1 · 0:06.0 – 0:10.0')).toBeOnTheScreen();
    expect(screen.getByText('0.0 dB')).toBeOnTheScreen();

    await fireEvent(screen.getByRole('adjustable', { name: 'Clip gain' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    expect(clip()?.gain).toBeLessThan(1);
    expect(screen.getByText('−1.0 dB')).toBeOnTheScreen();
    expect(saveChanges).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('sets the fades', async () => {
    const user = userEvent.setup();

    // Fade in comes first, then Fade out.
    await user.press(screen.getAllByRole('radio', { name: '0.5 s' })[0]!);
    await user.press(screen.getAllByRole('radio', { name: '2 s' })[1]!);

    expect(clip()).toMatchObject({ fadeIn: 0.5, fadeOut: 2 });
    expect(screen.getAllByRole('radio', { name: '0.5 s' })[0]).toBeChecked();
    expect(screen.getAllByRole('radio', { name: '2 s' })[1]).toBeChecked();
    expect(saveChanges).toHaveBeenCalledTimes(2);
  });

  it('restores the full take where it fits, then has nothing left to restore; undo brings it back', async () => {
    const user = userEvent.setup();
    const restore = screen.getByRole('button', { name: 'Restore full take' });

    await user.press(restore);

    expect(clip()).toMatchObject({ start: 2, offset: 0, duration: 20 });
    expect(screen.getByRole('button', { name: 'Restore full take' })).toBeDisabled();
    await act(() => undo());
    expect(clip()).toMatchObject({ start: 6, offset: 4, duration: 4 });
  });

  it('deletes the clip and closes', async () => {
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Delete clip' }));

    expect(mockBack).toHaveBeenCalled();
    expect(clip()).toBeUndefined();
  });
});
