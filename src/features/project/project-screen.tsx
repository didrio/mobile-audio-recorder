import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, ListRow, ListSection, Screen, Text, type IconName } from '@/components/ui';
import { formatDuration, formatTimecode } from '@/features/audio/format-time';
import { useProject } from '@/features/projects/queries';
import { makeStyles, useTheme } from '@/theme';

import { useTransport } from './use-transport';

/**
 * The project editor. T1 slice: one track, takes listed in order, record / play transport.
 * The orientation-aware timeline replaces the track list in T2.
 */
export function ProjectScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
  const clock =
    isRecording || isPlaying ? transport.position : (project.data?.duration ?? transport.position);
  const track = project.data?.tracks[0];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: project.data?.name ?? '' }} />

      <Screen>
        <View style={styles.clock}>
          <Text
            variant="timecode"
            color={isRecording ? 'primary' : 'text'}
            accessibilityLabel={isRecording ? 'Recording time' : 'Time'}>
            {formatTimecode(clock)}
          </Text>
          <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no">
            <View style={[styles.meterFill, { width: `${Math.round(transport.level * 100)}%` }]} />
          </View>
        </View>

        {transport.error ? (
          <Text color="danger" align="center">
            {transport.error}
          </Text>
        ) : null}

        {project.isError ? (
          <Text color="danger" align="center">
            Couldn&apos;t open this idea.
          </Text>
        ) : track ? (
          <ListSection title={track.name}>
            {track.clips.length === 0 ? (
              <ListRow title={isRecording ? 'Recording…' : 'No takes yet'} />
            ) : (
              track.clips.map((clip, index) => (
                <ListRow
                  key={clip.id}
                  title={`Take ${index + 1}`}
                  value={`${formatDuration(clip.start)} · ${formatDuration(clip.duration)}`}
                />
              ))
            )}
          </ListSection>
        ) : null}
      </Screen>

      <View style={[styles.transport, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <TransportButton
          label={isPlaying ? 'Stop' : 'Play'}
          icon={
            isPlaying
              ? { ios: 'stop.fill', android: 'stop' }
              : { ios: 'play.fill', android: 'play_arrow' }
          }
          size={PLAY_BUTTON_SIZE}
          kind="secondary"
          disabled={isRecording || isBusy || !track || track.clips.length === 0}
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
  clock: { alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.lg },
  meter: {
    width: '60%',
    height: t.spacing.xs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceMuted,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: t.colors.success },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xl,
    paddingTop: t.spacing.lg,
    paddingHorizontal: t.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
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
