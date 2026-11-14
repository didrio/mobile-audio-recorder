import { render, screen, userEvent } from '@testing-library/react-native';

import { deleteUnusedTakes, getProject, saveChanges } from '@/features/projects/projects-repo';

import { testProject, testSection, testTrack } from './edit-test-data';
import { closeIdea, openIdea, useEditorStore } from './editor-store';
import { NewSectionSheet } from './new-section-sheet';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ projectId: 'p1', start: '20', duration: '16' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));
jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
}));

const sections = () =>
  useEditorStore.getState().project?.sections.map((s) => [s.name, s.color, s.start, s.duration]);

async function renderSheet(grid = false) {
  jest.mocked(getProject).mockResolvedValue({
    ...testProject([testTrack('a', 0)], [testSection('s1', 'Verse', 0, 16)]),
    grid,
  });
  await openIdea('p1');
  await render(<NewSectionSheet />);
}

describe('NewSectionSheet', () => {
  beforeEach(() => {
    jest.mocked(saveChanges).mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
    mockBack.mockClear();
  });

  afterEach(() => closeIdea());

  it('adds a preset at the tapped spot, numbering a repeated one, then closes', async () => {
    const user = userEvent.setup();
    await renderSheet();

    expect(await screen.findByText('Starts at 0:20.0')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Chorus' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Verse 2' }));

    expect(sections()).toEqual([
      ['Verse', 'blue', 0, 16],
      ['Verse 2', 'blue', 20, 16],
    ]);
    expect(saveChanges).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalled();
  });

  it('counts the start in bars with the grid on', async () => {
    await renderSheet(true);

    // 120 bpm in 4/4: a bar is 2 s, so 0:20 is the start of bar 11.
    expect(await screen.findByText('Starts at bar 11')).toBeOnTheScreen();
  });

  it('adds a custom section with a name and color', async () => {
    const user = userEvent.setup();
    await renderSheet();

    await user.press(await screen.findByRole('button', { name: 'Custom…' }));
    expect(screen.getByRole('button', { name: 'Add section' })).toBeDisabled();
    await user.type(screen.getByLabelText('Section name'), 'Solo');
    await user.press(screen.getByRole('radio', { name: 'Pink' }));
    await user.press(screen.getByRole('button', { name: 'Add section' }));

    expect(sections()?.[1]).toEqual(['Solo', 'pink', 20, 16]);
    expect(mockBack).toHaveBeenCalled();
  });
});
