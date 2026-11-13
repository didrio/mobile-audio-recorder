import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  ensureRecordPermission,
  play,
  setTrackGain,
  startRecording,
} from '@/features/audio/audio-engine';
import {
  deleteUnusedTakes,
  getProject,
  saveChanges,
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
  Toolbar.Spacer = function Spacer() {
    return null;
  };
  Toolbar.Menu = function Menu({
    accessibilityLabel,
    children,
  }: {
    accessibilityLabel: string;
    children: ReactNode;
  }) {
    return (
      <>
        <Text>{accessibilityLabel}</Text>
        {children}
      </>
    );
  };
  Toolbar.MenuAction = function MenuAction({
    children,
    disabled,
  }: {
    children: string;
    disabled?: boolean;
  }) {
    return (
      <Pressable accessibilityRole="menuitem" accessibilityState={{ disabled }} disabled={disabled}>
        <Text>{children}</Text>
      </Pressable>
    );
  };
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
  setTrackGain: jest.fn(),
  playbackPosition: jest.fn(() => 0),
  playbackAnchor: jest.fn(() => null),
  decodeTake: jest.fn(),
  stopPlayback: jest.fn(),
  forgetTakes: jest.fn(),
}));

// The Skia timeline can't render in Jest; a stand-in shows the project and exposes seeking, arming,
// adding tracks and the mixer (the real controls are tested in `track-column.test.tsx` and
// `lane-overlay.test.tsx`).
jest.mock('@/features/timeline/timeline', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Timeline: ({
      project,
      armedTrackId,
      addTrackDisabled,
      onSeek,
      onArm,
      onAddTrack,
      onToggleMute,
      onVolumeLive,
      onVolumeCommit,
    }: {
      project: Project;
      armedTrackId: string | null;
      addTrackDisabled: boolean;
      onSeek: (time: number) => void;
      onArm: (trackId: string) => void;
      onAddTrack: () => void;
      onToggleMute: (trackId: string) => void;
      onVolumeLive: (trackId: string, gain: number) => void;
      onVolumeCommit: (trackId: string, gain: number) => void;
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New track"
          accessibilityState={{ disabled: addTrackDisabled }}
          disabled={addTrackDisabled}
          onPress={onAddTrack}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mute Track 1"
          onPress={() => onToggleMute('track1')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Drag Track 1 volume to half"
          onPress={() => {
            onVolumeLive('track1', 0.7);
            onVolumeLive('track1', 0.5);
            onVolumeCommit('track1', 0.5);
          }}
        />
        <Text>{`Track 1 volume ${project.tracks[0]?.volume}`}</Text>
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
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
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
    jest.mocked(saveChanges).mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue([]);
  });

  it('shows the timeline, the playhead time and the transport', async () => {
    await renderScreen();

    expect(await screen.findByText('Timeline of Chorus riff')).toBeOnTheScreen();
    expect(screen.getByText('0:00.0')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Record' })).toBeOnTheScreen();
  });

  function mockRecording() {
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
  }

  it('records onto the armed track at the playhead over the other tracks, lined up', async () => {
    jest.mocked(getProject).mockResolvedValue(twoTracks);
    mockRecording();
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
    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      [
        expect.objectContaining({
          table: 'clips',
          before: null,
          after: expect.objectContaining({
            trackId: 'track2',
            start: expect.closeTo(5.05),
            offset: 0,
          }),
        }),
      ],
      expect.objectContaining({ duration: 3.5, sampleRate: 48000, channels: 1 }),
    );
    // Back to where recording started.
    expect(screen.getByText('0:05.0')).toBeOnTheScreen();
  });

  it('adds a track and arms it', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    await user.press(screen.getByRole('button', { name: 'New track' }));

    expect(await screen.findByRole('button', { name: 'Arm Track 2' })).toBeSelected();
    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      [expect.objectContaining({ table: 'tracks', before: null })],
      undefined, // no new take
    );
  });

  it('undoes and redoes edits, only while idle', async () => {
    mockRecording();
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'New track' }));
    expect(await screen.findByRole('button', { name: 'Arm Track 2' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByRole('button', { name: 'Stop recording' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Stop recording' }));
    expect(await screen.findByRole('button', { name: 'Record' })).toBeOnTheScreen();

    // Undo the recording, then the added track; Redo brings the track back.
    await user.press(screen.getByRole('button', { name: 'Undo' }));
    await user.press(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('button', { name: 'Arm Track 2' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Redo' }));
    expect(await screen.findByRole('button', { name: 'Arm Track 2' })).toBeOnTheScreen();
    expect(saveChanges).toHaveBeenCalledTimes(5);
  });

  it('has a "More" menu with the idea actions (placeholders for now)', async () => {
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    expect(screen.getByText('More')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
  });

  it('sets a track volume live and saves it once, as one undo step', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    await user.press(screen.getByRole('button', { name: 'Drag Track 1 volume to half' }));

    expect(setTrackGain).toHaveBeenCalledWith('track1', 0.7);
    expect(setTrackGain).toHaveBeenLastCalledWith('track1', 0.5);
    expect(screen.getByText('Track 1 volume 0.5')).toBeOnTheScreen();
    expect(saveChanges).toHaveBeenCalledTimes(1);
    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      [expect.objectContaining({ after: expect.objectContaining({ volume: 0.5 }) })],
      undefined,
    );

    await user.press(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Track 1 volume 1')).toBeOnTheScreen();
    expect(setTrackGain).toHaveBeenLastCalledWith('track1', 1);
  });

  it('silences a muted track in the engine', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    await user.press(screen.getByRole('button', { name: 'Mute Track 1' }));

    expect(setTrackGain).toHaveBeenLastCalledWith('track1', 0);
    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      [expect.objectContaining({ after: expect.objectContaining({ muted: true }) })],
      undefined,
    );
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
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
  });

  it('stops playback when going back to the start', async () => {
    jest.mocked(play).mockResolvedValue();
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    await user.press(screen.getByRole('button', { name: 'Play' }));
    await user.press(await screen.findByRole('button', { name: 'Pause' }));
    await user.press(screen.getByRole('button', { name: 'Play' }));
    await user.press(await screen.findByRole('button', { name: 'Back to start' }));

    expect(await screen.findByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(screen.getByText('0:00.0')).toBeOnTheScreen();
  });

  it('goes back to the start', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    expect(screen.getByText('0:05.0')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back to start' }));

    expect(screen.getByText('0:00.0')).toBeOnTheScreen();
  });
});
