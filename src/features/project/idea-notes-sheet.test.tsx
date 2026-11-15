import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import {
  deleteUnusedTakes,
  getProject,
  saveChanges,
  setProjectNotes,
} from '@/features/projects/projects-repo';

import { testProject, testTrack } from './edit-test-data';
import { closeIdea, openIdea, useEditorStore } from './editor-store';
import { IdeaNotesSheet, NOTES_SAVE_DELAY_MS } from './idea-notes-sheet';
import { registerTransportLink } from './transport-link';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'p1' }) }));

jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));
jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  setProjectNotes: jest.fn(),
  deleteUnusedTakes: jest.fn(),
}));

const notes = () => useEditorStore.getState().project?.notes;

async function openWithNotes(text: string) {
  jest.mocked(getProject).mockResolvedValue({ ...testProject([testTrack('a', 0)]), notes: text });
  await openIdea('p1');
}

describe('IdeaNotesSheet', () => {
  const seek = jest.fn();
  let unregister: () => void = () => {};

  beforeEach(() => {
    jest.mocked(saveChanges).mockClear().mockResolvedValue();
    jest.mocked(setProjectNotes).mockClear().mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
    seek.mockClear();
    unregister = registerTransportLink({ playheadTime: () => 83.4, seek, replay: jest.fn() });
  });

  afterEach(async () => {
    unregister();
    await act(() => closeIdea());
  });

  it('starts editing when there are no notes, and saves once on Done without an undo step', async () => {
    await openWithNotes('');
    const user = userEvent.setup();
    await render(<IdeaNotesSheet />);

    await user.type(screen.getByLabelText('Idea notes'), 'Capo 2, DADGAD', { skipBlur: true });
    await user.press(screen.getByRole('button', { name: 'Done' }));
    // Done blurs the field (the keyboard goes away), which finishes editing.
    await fireEvent(screen.getByLabelText('Idea notes'), 'blur');

    expect(notes()).toBe('Capo 2, DADGAD');
    expect(setProjectNotes).toHaveBeenCalledWith('p1', 'Capo 2, DADGAD');
    expect(saveChanges).not.toHaveBeenCalled();
    expect(useEditorStore.getState().history.past).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeOnTheScreen();
  });

  it('saves while typing after a pause, and again when the sheet closes', async () => {
    jest.useFakeTimers();
    try {
      await openWithNotes('');
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await render(<IdeaNotesSheet />);

      await user.type(screen.getByLabelText('Idea notes'), 'Fmaj7', { skipBlur: true });
      expect(setProjectNotes).not.toHaveBeenCalled();
      await act(() => jest.advanceTimersByTimeAsync(NOTES_SAVE_DELAY_MS));
      expect(setProjectNotes).toHaveBeenLastCalledWith('p1', 'Fmaj7');

      await user.type(screen.getByLabelText('Idea notes'), ' Em7', { skipBlur: true });
      await screen.unmount();
      expect(notes()).toBe('Fmaj7 Em7');
      expect(setProjectNotes).toHaveBeenLastCalledWith('p1', 'Fmaj7 Em7');
    } finally {
      jest.useRealTimers();
    }
  });

  it('inserts the playhead time at the cursor', async () => {
    await openWithNotes('');
    const user = userEvent.setup();
    await render(<IdeaNotesSheet />);

    const field = screen.getByLabelText('Idea notes');
    await user.type(field, 'chorus', { skipBlur: true });
    await fireEvent(field, 'selectionChange', {
      nativeEvent: { selection: { start: 0, end: 0 } },
    });
    await user.press(screen.getByRole('button', { name: 'Insert time' }));

    expect(field).toHaveDisplayValue('[1:23] chorus');
  });

  it('shows saved notes with time stamps as links that move the playhead', async () => {
    await openWithNotes('[0:45] chorus: Fmaj7 – Em7');
    const user = userEvent.setup();
    await render(<IdeaNotesSheet />);

    expect(screen.queryByLabelText('Idea notes')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('link', { name: 'Go to 0:45' }));
    expect(seek).toHaveBeenCalledWith(45);
  });

  it('edits saved notes from the Edit button', async () => {
    await openWithNotes('Capo 2');
    const user = userEvent.setup();
    await render(<IdeaNotesSheet />);

    await user.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Idea notes')).toHaveDisplayValue('Capo 2');
  });
});
