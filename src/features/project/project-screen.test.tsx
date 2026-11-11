import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ensureRecordPermission, startRecording } from '@/features/audio/audio-engine';
import { addTakeWithClip, getProject, type Project } from '@/features/projects/projects-repo';

import { ProjectScreen } from './project-screen';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'p1' }),
}));

jest.mock('@/features/audio/audio-engine', () => ({
  ensureRecordPermission: jest.fn(),
  startRecording: jest.fn(),
  play: jest.fn(),
  playbackPosition: jest.fn(() => 0),
  stopPlayback: jest.fn(),
  forgetTakes: jest.fn(),
}));

jest.mock('@/features/audio/take-files', () => ({
  storeRecordedTake: jest.fn(
    (_path: string, projectId: string, takeId: string) =>
      `projects/${projectId}/takes/${takeId}.wav`,
  ),
}));

jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  addTakeWithClip: jest.fn(),
  listProjects: jest.fn(),
  createProject: jest.fn(),
  deleteProject: jest.fn(),
}));

const project: Project = {
  id: 'p1',
  name: 'Chorus riff',
  createdAt: 0,
  updatedAt: 0,
  duration: 12,
  takes: {
    t1: {
      id: 't1',
      projectId: 'p1',
      path: 'projects/p1/takes/t1.wav',
      duration: 12,
      sampleRate: 48000,
      channels: 1,
      createdAt: 0,
    },
  },
  tracks: [
    {
      id: 'track1',
      projectId: 'p1',
      position: 0,
      name: 'Track 1',
      volume: 1,
      muted: false,
      solo: false,
      clips: [{ id: 'c1', trackId: 'track1', takeId: 't1', start: 0, offset: 0, duration: 12 }],
    },
  ],
};

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const AppProviders = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<ProjectScreen />, { wrapper: AppProviders });
}

describe('ProjectScreen', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(project);
  });

  it('shows the track with its takes and the transport', async () => {
    await renderScreen();

    expect(await screen.findByText('Take 1')).toBeOnTheScreen();
    expect(screen.getByText('Track 1')).toBeOnTheScreen();
    expect(screen.getByText('0:12.0')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Record' })).toBeOnTheScreen();
  });

  it('records a take and saves it after the last clip', async () => {
    jest.mocked(ensureRecordPermission).mockResolvedValue(true);
    jest.mocked(startRecording).mockResolvedValue({
      stop: jest.fn(() =>
        Promise.resolve({ path: '/cache/take.wav', duration: 3.5, sampleRate: 48000, channels: 1 }),
      ),
    });
    jest.mocked(addTakeWithClip).mockResolvedValue();
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Take 1'); // Record is disabled until the project has loaded.
    await user.press(screen.getByRole('button', { name: 'Record' }));
    await user.press(await screen.findByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByRole('button', { name: 'Record' })).toBeOnTheScreen();
    expect(addTakeWithClip).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        trackId: 'track1',
        start: 12,
        take: expect.objectContaining({ duration: 3.5, sampleRate: 48000, channels: 1 }),
      }),
    );
  });

  it('explains when microphone access is denied', async () => {
    jest.mocked(ensureRecordPermission).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Take 1'); // Record is disabled until the project has loaded.
    await user.press(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByText(/Microphone access is off/)).toBeOnTheScreen();
  });
});
