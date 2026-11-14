import { render, screen, userEvent } from '@testing-library/react-native';

import { deleteUnusedTakes, getProject, saveChanges } from '@/features/projects/projects-repo';

import { testProject, testSection, testTrack } from './edit-test-data';
import { closeIdea, openIdea, useEditorStore } from './editor-store';
import { SectionNotesSheet } from './section-notes-sheet';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 's1', projectId: 'p1' }),
}));

jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));
jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
}));

const notes = () => useEditorStore.getState().project?.sections[0]?.notes;

describe('SectionNotesSheet', () => {
  beforeEach(async () => {
    jest.mocked(saveChanges).mockClear().mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
    jest
      .mocked(getProject)
      .mockResolvedValue(testProject([testTrack('a', 0)], [testSection('s1', 'Chorus', 0, 8)]));
    await openIdea('p1');
  });

  afterEach(() => closeIdea());

  it('saves the note once when the field loses focus and the sheet then closes', async () => {
    const user = userEvent.setup();
    await render(<SectionNotesSheet />);

    expect(await screen.findByRole('header', { name: 'Chorus' })).toBeOnTheScreen();
    // `user.type` focuses, types, then blurs the field.
    await user.type(screen.getByLabelText('Notes for Chorus'), 'Fmaj7 Em7');
    expect(notes()).toBe('Fmaj7 Em7');
    await screen.unmount();

    expect(saveChanges).toHaveBeenCalledTimes(1);
  });

  it('saves when the sheet closes while still typing, and not at all without a change', async () => {
    const user = userEvent.setup();
    await render(<SectionNotesSheet />);

    await user.type(await screen.findByLabelText('Notes for Chorus'), 'Capo 2', { skipBlur: true });
    expect(saveChanges).not.toHaveBeenCalled();
    await screen.unmount();

    expect(notes()).toBe('Capo 2');
    expect(saveChanges).toHaveBeenCalledTimes(1);
  });
});
