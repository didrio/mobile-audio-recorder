import { render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  deleteUnusedTakes,
  getProject,
  saveChanges,
  type Project,
} from '@/features/projects/projects-repo';

import { closeIdea, openIdea, useEditorStore } from './editor-store';
import { TrackSheet } from './track-sheet';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'track2', projectId: 'p1' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));
jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
}));

const track = (id: string, name: string, clipCount: number): Project['tracks'][number] => ({
  id,
  projectId: 'p1',
  position: 0,
  name,
  volume: 1,
  muted: false,
  solo: false,
  clips: Array.from({ length: clipCount }, (_, index) => ({
    id: `${id}-c${index}`,
    trackId: id,
    takeId: 't1',
    start: 0,
    offset: 0,
    duration: 1,
  })),
});

const project = (tracks: Project['tracks']): Project => ({
  id: 'p1',
  name: 'Chorus riff',
  createdAt: 0,
  updatedAt: 0,
  duration: 1,
  armedTrackId: null,
  preRoll: false,
  bpm: 120,
  beatsPerBar: 4,
  beatUnit: 4,
  grid: false,
  takes: {},
  tracks,
});

/** Opens the idea in the editor store (the project screen does this) and shows the sheet over it. */
async function renderSheet(tracks: Project['tracks']) {
  jest.mocked(getProject).mockResolvedValue(project(tracks));
  await openIdea('p1');
  await render(<TrackSheet />);
  return await screen.findByLabelText('Track name');
}

const trackNames = () => useEditorStore.getState().project?.tracks.map((t) => t.name);

describe('TrackSheet', () => {
  const twoTracks = () => [track('track1', 'Track 1', 1), track('track2', 'Track 2', 1)];

  beforeEach(() => {
    jest.mocked(saveChanges).mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
  });

  afterEach(() => closeIdea());

  it('renames the track', async () => {
    const user = userEvent.setup();
    const input = await renderSheet(twoTracks());

    await user.clear(input);
    await user.type(input, 'Vocals', { submitEditing: true });

    expect(trackNames()).toEqual(['Track 1', 'Vocals']);
    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      [
        expect.objectContaining({
          id: 'track2',
          after: expect.objectContaining({ name: 'Vocals' }),
        }),
      ],
      undefined, // no new take
    );
  });

  it('asks before deleting a track with clips, then closes', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await renderSheet(twoTracks());

    await user.press(screen.getByRole('button', { name: 'Delete track' }));
    expect(trackNames()).toEqual(['Track 1', 'Track 2']);
    const buttons = alert.mock.calls[0]?.[2];
    await buttons?.find((button) => button.text === 'Delete')?.onPress?.();

    expect(trackNames()).toEqual(['Track 1']);
    expect(mockBack).toHaveBeenCalled();
  });

  it("doesn't offer to delete the only track", async () => {
    await renderSheet([track('track2', 'Track 2', 0)]);

    expect(screen.queryByRole('button', { name: 'Delete track' })).not.toBeOnTheScreen();
    expect(screen.getByText('An idea needs at least one track.')).toBeOnTheScreen();
  });
});
