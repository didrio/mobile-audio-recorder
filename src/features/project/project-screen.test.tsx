import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  cutTrackAt,
  ensureRecordPermission,
  play,
  playbackPosition,
  setMetering,
  setTrackGain,
  startRecording,
} from '@/features/audio/audio-engine';
import { discardRecordedFile } from '@/features/audio/take-files';
import {
  deleteUnusedTakes,
  getProject,
  saveChanges,
  setArmedTrack,
  setPreRoll,
  type Project,
} from '@/features/projects/projects-repo';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';

import { ProjectScreen } from './project-screen';

const mockPush = jest.fn();

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
    onPress,
  }: {
    children: string;
    disabled?: boolean;
    onPress?: () => void;
  }) {
    return (
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    );
  };
  return {
    Stack: { Screen: () => null, Toolbar },
    useIsFocused: () => true,
    useLocalSearchParams: () => ({ id: 'p1' }),
    useRouter: () => ({ push: mockPush }),
  };
});

jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));

jest.mock('@/features/audio/audio-engine', () => ({
  ensureRecordPermission: jest.fn(),
  setMetering: jest.fn(() => Promise.resolve()),
  startRecording: jest.fn(),
  cutTrackAt: jest.fn(),
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
  discardRecordedFile: jest.fn(),
  storeRecordedTake: jest.fn(
    (_path: string, projectId: string, takeId: string) =>
      `projects/${projectId}/takes/${takeId}.wav`,
  ),
}));

jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  setArmedTrack: jest.fn(() => Promise.resolve()),
  setPreRoll: jest.fn(() => Promise.resolve()),
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
  armedTrackId: 'track1',
  preRoll: false,
  bpm: 120,
  beatsPerBar: 4,
  beatUnit: 4,
  grid: false,
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
    jest.mocked(playbackPosition).mockReturnValue(0);
    useRecordingSettingsStore.setState({ latencyOffsetMs: 0, preRollSeconds: 2, preRollBars: 1 });
    mockPush.mockClear();
  });

  it('shows the timeline, the playhead time and the transport', async () => {
    await renderScreen();

    expect(await screen.findByText('Timeline of Chorus riff')).toBeOnTheScreen();
    expect(screen.getByText('0:00.0')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Record' })).toBeOnTheScreen();
  });

  // The file starts 0.1 s after playback, minus 0.05 s of latency: 0.05 s after `anchor.from`.
  const alignment = {
    playbackStartedAt: 10,
    recorderStartedAt: 10.1,
    outputLatency: 0.02,
    inputLatency: 0.03,
  };
  // `startedAtMs` in the future keeps the clock at `from` (still in the run-up).
  function mockRecording({ from = 5, duration = 3.5, startedAtMs = 0 } = {}) {
    jest.mocked(ensureRecordPermission).mockResolvedValue(true);
    jest.mocked(startRecording).mockResolvedValue({
      anchor: { from, startedAtMs },
      whenStarted: () => Promise.resolve(alignment),
      stop: jest.fn(() =>
        Promise.resolve({
          path: '/cache/take.wav',
          duration,
          sampleRate: 48000,
          channels: 1,
          alignment,
        }),
      ),
    });
  }

  it('disarms on a second tap, which grays out Record and releases the mic', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    expect(screen.getByRole('button', { name: 'Arm Track 1' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
    expect(setMetering).toHaveBeenLastCalledWith(expect.any(Function)); // armed: meter listens

    await user.press(screen.getByRole('button', { name: 'Arm Track 1' }));

    expect(screen.getByRole('button', { name: 'Arm Track 1' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    expect(setMetering).toHaveBeenLastCalledWith(null);
    expect(setArmedTrack).toHaveBeenCalledWith('p1', null);
  });

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
        playback: {
          from: 5,
          clips: [expect.objectContaining({ takePath: 'projects/p1/takes/t1.wav', start: 0 })],
        },
      }),
    );
    expect(cutTrackAt).not.toHaveBeenCalled();
    // The clock shows the timeline position (like the playhead), not the take's elapsed time.
    expect(await screen.findByLabelText('Recording time')).toHaveTextContent('0:05.0');
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

  it('toggles pre-roll and saves it with the idea', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    expect(screen.getByRole('switch', { name: 'Pre-roll' })).not.toBeChecked();
    await user.press(screen.getByRole('switch', { name: 'Pre-roll' }));

    expect(screen.getByRole('switch', { name: 'Pre-roll' })).toBeChecked();
    expect(setPreRoll).toHaveBeenCalledWith('p1', true);
  });

  it('with pre-roll, plays every track from before the playhead and punches in at it', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...project, preRoll: true });
    mockRecording({ from: 3, startedAtMs: performance.now() + 60_000 });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    await user.press(screen.getByRole('button', { name: 'Record' }));

    // The armed track plays too (its clip is the only one), from 2 s before the playhead.
    expect(startRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        playback: { from: 3, clips: [expect.objectContaining({ trackId: 'track1' })] },
      }),
    );
    expect(cutTrackAt).toHaveBeenCalledWith('track1', 5);
    expect(await screen.findByLabelText('Pre-roll time')).toHaveTextContent('0:03.0');
    await user.press(screen.getByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByRole('button', { name: 'Record' })).toBeOnTheScreen();
    // The take starts at the punch point; its run-up (from 3.05 on the timeline) is skipped.
    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([
        expect.objectContaining({
          before: null,
          after: expect.objectContaining({ start: 5, offset: expect.closeTo(1.95) }),
        }),
      ]),
      expect.objectContaining({ duration: 3.5 }),
    );
    expect(screen.getByText('0:05.0')).toBeOnTheScreen();
  });

  it('with the grid on, the run-up is whole bars of the idea tempo', async () => {
    // 60 BPM in 4/4: one bar is 4 s, so the run-up starts at 5 - 4 = 1.
    jest.mocked(getProject).mockResolvedValue({ ...project, preRoll: true, grid: true, bpm: 60 });
    mockRecording({ from: 1, startedAtMs: performance.now() + 60_000 });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    await user.press(screen.getByRole('button', { name: 'Record' }));

    expect(startRecording).toHaveBeenCalledWith(
      expect.objectContaining({ playback: expect.objectContaining({ from: 1 }) }),
    );
  });

  it('saves nothing when stopped during the run-up', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...project, preRoll: true });
    mockRecording({ from: 3, duration: 1 });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    await user.press(screen.getByRole('button', { name: 'Record' }));
    await user.press(await screen.findByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByRole('button', { name: 'Record' })).toBeOnTheScreen();
    expect(discardRecordedFile).toHaveBeenCalledWith('/cache/take.wav');
    expect(saveChanges).not.toHaveBeenCalled();
    expect(screen.getByText('0:05.0')).toBeOnTheScreen();
  });

  it('punches in on the fly when Record is pressed while playing', async () => {
    jest.mocked(play).mockResolvedValue();
    // Playback started at 0:00, so the file (from 0.05 s on) covers the punch at 6.03 s.
    mockRecording({ from: 0, duration: 8 });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Play' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    jest.mocked(playbackPosition).mockReturnValue(6);
    await user.press(screen.getByRole('button', { name: 'Record' }));

    // The running playback keeps going; the armed track is cut just ahead of the current position.
    expect(startRecording).toHaveBeenCalledWith(
      expect.objectContaining({ playback: { continueFrom: 6 } }),
    );
    expect(cutTrackAt).toHaveBeenCalledWith('track1', expect.closeTo(6.03));
    await user.press(await screen.findByRole('button', { name: 'Stop recording' }));
    expect(await screen.findByRole('button', { name: 'Record' })).toBeOnTheScreen();

    expect(saveChanges).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([
        expect.objectContaining({
          before: null,
          after: expect.objectContaining({ start: expect.closeTo(6.03) }),
        }),
      ]),
      expect.anything(),
    );
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

  it('has a "More" menu: Idea settings, Duplicate and Delete work, Favorite is a placeholder', async () => {
    await renderScreen();

    await screen.findByText('Timeline of Chorus riff');
    expect(screen.getByText('More')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'Favorite' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Idea settings' })).toBeEnabled();
  });

  it('opens the idea settings sheet from the menu', async () => {
    await renderScreen();
    await screen.findByText('Timeline of Chorus riff');

    await userEvent.setup().press(screen.getByRole('menuitem', { name: 'Idea settings' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/idea-settings/[id]',
      params: { id: 'p1' },
    });
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

  it('keeps playing from the start when going back to the start while playing', async () => {
    jest.mocked(play).mockResolvedValue();
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Seek to 0:05' }));
    await user.press(screen.getByRole('button', { name: 'Play' }));
    await user.press(await screen.findByRole('button', { name: 'Back to start' }));

    expect(play).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ from: 0 }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
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
