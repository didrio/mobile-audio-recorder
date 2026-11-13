import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import {
  deleteTrack,
  getProject,
  renameTrack,
  type Project,
} from '@/features/projects/projects-repo';

import { TrackSheet } from './track-sheet';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'track2', projectId: 'p1' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  renameTrack: jest.fn(),
  deleteTrack: jest.fn(),
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
  takes: {},
  tracks,
});

async function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await render(<TrackSheet />, { wrapper });
  return await screen.findByLabelText('Track name');
}

describe('TrackSheet', () => {
  beforeEach(() => {
    jest
      .mocked(getProject)
      .mockResolvedValue(project([track('track1', 'Track 1', 1), track('track2', 'Track 2', 1)]));
  });

  it('renames the track', async () => {
    jest.mocked(renameTrack).mockResolvedValue();
    const user = userEvent.setup();
    const input = await renderSheet();

    await user.clear(input);
    await user.type(input, 'Vocals', { submitEditing: true });

    expect(renameTrack).toHaveBeenCalledWith({
      projectId: 'p1',
      trackId: 'track2',
      name: 'Vocals',
    });
  });

  it('asks before deleting a track with clips, then closes', async () => {
    jest.mocked(deleteTrack).mockResolvedValue();
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await renderSheet();

    await user.press(screen.getByRole('button', { name: 'Delete track' }));
    expect(deleteTrack).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2];
    await buttons?.find((button) => button.text === 'Delete')?.onPress?.();

    expect(deleteTrack).toHaveBeenCalledWith({ projectId: 'p1', trackId: 'track2' });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("doesn't offer to delete the only track", async () => {
    jest.mocked(getProject).mockResolvedValue(project([track('track2', 'Track 2', 0)]));
    await renderSheet();

    expect(screen.queryByRole('button', { name: 'Delete track' })).not.toBeOnTheScreen();
    expect(screen.getByText('An idea needs at least one track.')).toBeOnTheScreen();
  });
});
