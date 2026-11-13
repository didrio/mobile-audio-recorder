import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ensureRecordPermission, play, startRecording } from '@/features/audio/audio-engine';
import {
  addTakeWithClip,
  addTrack,
  getProject,
  type Project,
} from '@/features/projects/projects-repo';

import { ProjectScreen } from './project-screen';

jest.mock('expo-router', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const ToolbarButton = ({
    accessibilityLabel,
    disabled,
    onPress,
  }: {
    accessibilityLabel: string;
    disabled?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}>
      <Text>{accessibilityLabel}</Text>
    </Pressable>
  );
  const Toolbar = ({ children }: { children: ReactNode }) => children;
  Toolbar.Button = ToolbarButton;
  return {
    Stack: { Screen: () => null, Toolbar },
    useLocalSearchParams: () => ({ id: 'p1' }),
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));

jest.mock('@/features/audio/audio-engine', () => ({
  ensureRecordPermission: jest.fn(),
  startRecording: jest.fn(),
  peakLevel: jest.fn(() => 0),
  play: jest.fn(),
  playbackPosition: jest.fn(() => 0),
  playbackAnchor: jest.fn(() => null),
  decodeTake: jest.fn(),
  stopPlayback: jest.fn(),
  forgetTakes: jest.fn(),
}));

// The Skia timeline can't render in Jest; a stand-in shows the project and exposes seeking and
// arming (the real track headers are tested in `track-headers.test.tsx`).
jest.mock('@/features/timeline/timeline', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Timeline: ({
      project,
      armedTrackId,
      onSeek,
      onArm,
    }: {
      project: Project;
      armedTrackId: string | null;
      onSeek: (time: number) => void;
      onArm: (trackId: string) => void;
    }) => (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Seek to 0:05"
          onPress={() => onSeek(5)}>
          <Text>{`Timeline of ${project.name}`}</Text>
        </Pressable>
        {project.tracks.map((track) => (
          <Pressable
            key={track.id}
            accessibilityRole="button"
            accessibilityLabel={`Arm ${track.name}`}
            accessibilityState={{ selected: track.id === armedTrackId }}
            onPress={() => onArm(track.id)}
          />
        ))}
      </View>
    ),
  };
});

jest.mock('@/features/audio/take-files', () => ({
  storeRecordedTake: jest.fn(
    (_path: string, projectId: string, takeId: string) =>
      `projects/${projectId}/takes/${takeId}.wav`,
  ),
}));

jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  addTakeWithClip: jest.fn(),
  addTrack: jest.fn(),
  renameTrack: jest.fn(),
  deleteTrack: jest.fn(),
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

const track2: Project['tracks'][number] = {
  id: 'track2',
  projectId: 'p1',
  position: 1,
  name: 'Track 2',
  volume: 1,
  muted: false,
  solo: false,
  clips: [],
};
const twoTracks: Project = { ...project, tracks: [...project.tracks, track2] };

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

  it('shows the timeline, the playhead time and the transport', async () => {
    await renderScreen();

    expect(await screen.findByText('Timeline of Chorus riff')).toBeOnTheScreen();
    expect(screen.getByText('0:00.0')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Record' })).toBeOnTheScreen();
  });

  it('records onto the armed track at the playhead over the other tracks, lined up', async () => {
    jest.mocked(getProject).mockResolvedValue(twoTracks);
    jest.mocked(ensureRecordPermission).mockResolvedValue(true);
    jest.mocked(startRecording).mockResolvedValue({
      anchor: { from: 5, startedAtMs: 0 },
      stop: jest.fn(() =>
        Promise.resolve({
          path: '/cache/take.wav',
          duration: 3.5,
          sampleRate: 48000,
          channels: 1,
          alignment: {
            playbackStartedAt: 10,
            recorderStartedAt: 10.1,
            outputLatency: 0.02,
            inputLatency: 0.03,
          },
        }),
      ),
    });
    jest.mocked(addTakeWithClip).mockResolvedValue();
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Arm Track 2' }));
    expect(screen.getByRole('button', { name: 'Arm Track 2' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Seek to 0:05' }));
    await user.press(screen.getByRole('button', { name: 'Record' }));

    expect(startRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 5,
        backing: [expect.objectContaining({ takePath: 'projects/p1/takes/t1.wav', start: 0 })],
      }),
    );
    await user.press(await screen.findByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByRole('button', { name: 'Record' })).toBeOnTheScreen();
    expect(addTakeWithClip).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        trackId: 'track2',
        start: expect.closeTo(5.05),
        offset: 0,
        take: expect.objectContaining({ duration: 3.5, sampleRate: 48000, channels: 1 }),
      }),
    );
    // Back to where recording started.
    expect(screen.getByText('0:05.0')).toBeOnTheScreen();
  });

  it('suggests headphones when recording over other tracks', async () => {
    jest.mocked(getProject).mockResolvedValue(twoTracks);
    const user = userEvent.setup();
    await renderScreen();

    // Track 1 is armed and holds the only clip: nothing to record over.
    await screen.findByText('Timeline of Chorus riff');
    expect(screen.queryByText(/Use headphones/)).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Arm Track 2' }));
    expect(screen.getByText(/Use headphones/)).toBeOnTheScreen();
  });

  it('adds a track and arms it', async () => {
    jest.mocked(addTrack).mockImplementation(async () => {
      jest.mocked(getProject).mockResolvedValue(twoTracks);
      const { clips: _clips, ...added } = track2;
      return added;
    });
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    await user.press(screen.getByRole('button', { name: 'Add track' }));

    expect(addTrack).toHaveBeenCalledWith('p1');
    expect(await screen.findByRole('button', { name: 'Arm Track 2' })).toBeSelected();
  });

  it('explains when microphone access is denied', async () => {
    jest.mocked(ensureRecordPermission).mockResolvedValue(false);
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff'); // Record is disabled until loaded.
    await user.press(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByText(/Microphone access is off/)).toBeOnTheScreen();
  });

  it('plays from the playhead after seeking', async () => {
    jest.mocked(play).mockResolvedValue();
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    expect(screen.getByText('0:05.0')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Play' }));

    expect(play).toHaveBeenCalledWith(
      [expect.objectContaining({ takePath: 'projects/p1/takes/t1.wav', start: 0, duration: 12 })],
      expect.objectContaining({ from: 5 }),
    );
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeOnTheScreen();
  });
});
