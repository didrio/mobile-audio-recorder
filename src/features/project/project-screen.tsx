import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { formatTimecode } from '@/features/audio/format-time';
import { useProject } from '@/features/projects/queries';
import { Timeline } from '@/features/timeline/timeline';
import { orientationOf } from '@/features/timeline/timeline-axis';
import { makeStyles, useTheme } from '@/theme';

import { useTransport } from './use-transport';

/**
 * The project editor: clock, timeline and transport. Portrait stacks them (time runs down the
 * timeline); landscape puts the clock and transport in a column beside the timeline (time runs
 * left to right), so the controls stay reachable either way.
 */
export function ProjectScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The native header floats over the content (iOS 26+), so start below it.
  const headerHeight = useHeaderHeight();
  const window = useWindowDimensions();
  const orientation = orientationOf(window.width, window.height);
  const isLandscape = orientation === 'landscape';
  const params = useLocalSearchParams<{ id: string; record?: string }>();
  const project = useProject(params.id);
  const transport = useTransport(project.data);

  // Quick capture: opened from "Record new idea", start recording as soon as the project is loaded.
  const autoRecordDone = useRef(false);
  const shouldAutoRecord = params.record === '1' && project.data != null;
  const { record } = transport;
  useEffect(() => {
    if (!shouldAutoRecord || autoRecordDone.current) return;
    autoRecordDone.current = true;
    void record();
  }, [shouldAutoRecord, record]);

  const isRecording = transport.status === 'recording';
  const isPlaying = transport.status === 'playing';
  const isBusy = transport.status === 'starting' || transport.status === 'stopping';
  const track = project.data?.tracks[0];
  const hasClips = project.data?.tracks.some((t) => t.clips.length > 0) ?? false;

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

  const buttons = (
    <View style={styles.buttons}>
      <TransportButton
        label={isPlaying ? 'Stop' : 'Play'}
        icon={
          isPlaying
            ? { ios: 'stop.fill', android: 'stop' }
            : { ios: 'play.fill', android: 'play_arrow' }
        }
        size={PLAY_BUTTON_SIZE}
        kind="secondary"
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
        size={RECORD_BUTTON_SIZE}
        kind="record"
        busy={isBusy}
        disabled={isBusy || isPlaying || !track}
        onPress={isRecording ? () => void transport.stopRecording() : () => void record()}
      />
      {/* Balances the play button so the record button stays centered. */}
      <View style={{ width: PLAY_BUTTON_SIZE }} />
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
      orientation={orientation}
      playhead={transport.playhead}
      following={isPlaying || isRecording}
      recordingStart={transport.recordingStart}
      onSeek={transport.seek}
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
  kind: 'record' | 'secondary';
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
        kind === 'record' ? styles.recordButton : styles.secondaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon
        name={icon}
        size={Math.round(size * 0.42)}
        color={kind === 'record' ? 'onPrimary' : 'primary'}
      />
    </Pressable>
  );
}

const RECORD_BUTTON_SIZE = 72;
const PLAY_BUTTON_SIZE = 56;

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
  secondaryButton: { backgroundColor: t.colors.surfacePressed },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
}));
