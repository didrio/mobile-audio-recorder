import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { formatTimecode } from '@/features/audio/format-time';
import { useAddTrack, useProject } from '@/features/projects/queries';
import { Timeline } from '@/features/timeline/timeline';
import { makeStyles, useTheme } from '@/theme';

import { useTransport } from './use-transport';

/**
 * The project editor: clock, timeline and transport. The timeline runs left to right in both
 * orientations; portrait stacks clock, timeline and transport, landscape puts the clock and
 * transport in a column beside the timeline so it gets the full height. Transport: back to start,
 * Play (the main button) and Record. One track is armed: Record records onto it while the others
 * play. "Add track" in the header adds a track and arms it.
 */
export function ProjectScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The native header floats over the content (iOS 26+), so start below it.
  const headerHeight = useHeaderHeight();
  const window = useWindowDimensions();
  const isLandscape = window.width > window.height;
  const params = useLocalSearchParams<{ id: string; record?: string }>();
  const router = useRouter();
  const project = useProject(params.id);
  const transport = useTransport(project.data);
  const addTrack = useAddTrack();

  // The armed track; falls back to the first track (e.g. after the armed one was deleted).
  const [armedId, setArmedId] = useState<string | null>(null);
  const tracks = project.data?.tracks ?? [];
  const armedTrack = tracks.find((t) => t.id === armedId) ?? tracks[0];

  const isRecording = transport.status === 'recording';
  const isPlaying = transport.status === 'playing';
  const isBusy = transport.status === 'starting' || transport.status === 'stopping';
  const isIdle = transport.status === 'idle';
  const hasClips = tracks.some((t) => t.clips.length > 0);

  const { record } = transport;
  const recordArmed = () => {
    if (armedTrack) void record(armedTrack.id);
  };

  // Quick capture: opened from "Record new idea", start recording as soon as the project is loaded.
  const autoRecordDone = useRef(false);
  const firstTrackId = params.record === '1' ? project.data?.tracks[0]?.id : undefined;
  useEffect(() => {
    if (!firstTrackId || autoRecordDone.current) return;
    autoRecordDone.current = true;
    void record(firstTrackId);
  }, [firstTrackId, record]);

  const onAddTrack = async () => {
    if (!project.data) return;
    try {
      const track = await addTrack.mutateAsync(project.data.id);
      setArmedId(track.id);
    } catch {
      // The list stays as it was; nothing to clean up.
    }
  };

  const editTrack = (trackId: string) =>
    router.push({ pathname: '/track/[id]', params: { id: trackId, projectId: params.id } });

  const clock = (
    <View style={styles.clock}>
      <Text
        variant="timecode"
        color={isRecording ? 'primary' : 'text'}
        accessibilityLabel={isRecording ? 'Recording time' : 'Time'}>
        {formatTimecode(transport.position)}
      </Text>
      <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.meterFill, { width: `${Math.round(transport.level * 100)}%` }]} />
      </View>
    </View>
  );

  // Back to start | Play (main, centered) | Record. The outer two share a width so Play stays centered.
  const buttons = (
    <View style={styles.buttons}>
      <TransportButton
        label="Back to start"
        icon={{ ios: 'backward.end.fill', android: 'skip_previous' }}
        size={SIDE_BUTTON_SIZE}
        kind="secondary"
        disabled={isRecording || isBusy}
        onPress={() => transport.seek(0)}
      />
      <TransportButton
        label={isPlaying ? 'Stop' : 'Play'}
        icon={
          isPlaying
            ? { ios: 'stop.fill', android: 'stop' }
            : { ios: 'play.fill', android: 'play_arrow' }
        }
        size={PLAY_BUTTON_SIZE}
        kind="play"
        disabled={isRecording || isBusy || !hasClips}
        onPress={isPlaying ? transport.stopPlaying : () => void transport.startPlayback()}
      />
      <TransportButton
        label={isRecording ? 'Stop recording' : 'Record'}
        icon={
          isRecording
            ? { ios: 'stop.fill', android: 'stop' }
            : { ios: 'record.circle', android: 'radio_button_checked' }
        }
        size={SIDE_BUTTON_SIZE}
        kind="record"
        busy={isBusy}
        disabled={isBusy || isPlaying || !armedTrack}
        onPress={isRecording ? () => void transport.stopRecording() : recordArmed}
      />
    </View>
  );

  const errorText = transport.error ? (
    <Text color="danger" align="center" variant="footnote">
      {transport.error}
    </Text>
  ) : null;

  const timeline = project.isError ? (
    <View style={styles.message}>
      <Text color="danger" align="center">
        Couldn&apos;t open this idea.
      </Text>
    </View>
  ) : project.data ? (
    <Timeline
      project={project.data}
      playhead={transport.playhead}
      following={isPlaying || isRecording}
      liveTake={transport.liveTake}
      armedTrackId={armedTrack?.id ?? null}
      onSeek={transport.seek}
      onArm={setArmedId}
      onEditTrack={editTrack}
    />
  ) : (
    <View style={styles.message} />
  );

  return (
    <View
      style={[
        styles.root,
        isLandscape && styles.rootLandscape,
        { paddingTop: headerHeight, paddingLeft: insets.left, paddingRight: insets.right },
      ]}>
      <Stack.Screen options={{ title: project.data?.name ?? '' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={Platform.OS === 'ios' ? 'plus' : undefined}
          accessibilityLabel="Add track"
          disabled={!project.data || !isIdle || addTrack.isPending}
          onPress={() => void onAddTrack()}>
          Add track
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {isLandscape ? (
        <>
          <View style={[styles.timeline, { paddingBottom: insets.bottom }]}>{timeline}</View>
          <View style={[styles.sidePanel, { paddingBottom: insets.bottom + theme.spacing.md }]}>
            {clock}
            {errorText}
            {buttons}
          </View>
        </>
      ) : (
        <>
          {clock}
          {errorText}
          <View style={styles.timeline}>{timeline}</View>
          <View style={[styles.transport, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            {buttons}
          </View>
        </>
      )}
    </View>
  );
}

/** Round, icon-only transport control; `label` is what screen readers (and tests) see. */
function TransportButton({
  label,
  icon,
  size,
  kind,
  busy = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: IconName;
  size: number;
  kind: 'play' | 'record' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.transportButton,
        { width: size, height: size },
        kind === 'record' && styles.recordButton,
        kind === 'play' && styles.playButton,
        kind === 'secondary' && styles.secondaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon
        name={icon}
        size={Math.round(size * 0.42)}
        color={kind === 'record' ? 'onPrimary' : kind === 'play' ? 'background' : 'text'}
      />
    </Pressable>
  );
}

const PLAY_BUTTON_SIZE = 76;
const SIDE_BUTTON_SIZE = 56;

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  rootLandscape: { flexDirection: 'row' },
  clock: { alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.md },
  meter: {
    width: '60%',
    height: t.spacing.xs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceMuted,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: t.colors.success },
  timeline: { flex: 1 },
  message: { flex: 1, justifyContent: 'center', padding: t.spacing.lg },
  transport: {
    paddingTop: t.spacing.lg,
    paddingHorizontal: t.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  sidePanel: {
    justifyContent: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    borderLeftWidth: 1,
    borderLeftColor: t.colors.border,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xl,
  },
  transportButton: {
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: { backgroundColor: t.colors.primary },
  playButton: { backgroundColor: t.colors.text },
  secondaryButton: { backgroundColor: t.colors.surfacePressed },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
}));
