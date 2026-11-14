import * as Haptics from 'expo-haptics';
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AndroidHeaderMenu } from '@/components/android-header-menu';
import { Icon, Text, type IconName } from '@/components/ui';
import { setTrackGain } from '@/features/audio/audio-engine';
import { formatTimecode } from '@/features/audio/format-time';
import { confirmDeleteIdea } from '@/features/projects/idea-actions';
import { useDeleteProject, useDuplicateProject } from '@/features/projects/queries';
import { Timeline, type ClipEditing } from '@/features/timeline/timeline';
import { makeStyles, useTheme } from '@/theme';

import {
  addTrack,
  deleteClip,
  duplicateClip,
  moveTrack,
  placeClip,
  redo,
  selectArmedTrack,
  splitClip,
  selectCanRedo,
  selectCanUndo,
  setTrackVolume,
  toggleMute,
  toggleArm,
  togglePreRoll,
  toggleSolo,
  undo,
  useEditorStore,
  useOpenIdea,
} from './editor-store';
import { IDEA_MENU_ITEMS, type IdeaMenuItemId } from './idea-menu-items';
import { hasSolo, trackOutputGain } from './mixer';
import { useInputMeter } from './use-input-meter';
import { useTransport } from './use-transport';

/**
 * The project editor: a thin status strip (clock, pre-roll toggle, room for T17's metronome toggle,
 * meter), the timeline, then a compact transport row (Back to start · Play · Record). Record while
 * playing punches in on the fly; with pre-roll on, Record starts with a run-up (`use-transport.ts`). The app is portrait-only
 * (`orientation` in app.json), so there is no landscape layout. One track is
 * armed: Record records onto it while the others play. Tracks are added from the timeline's
 * "+ New Track" row. The header has Undo, Redo (enabled only while idle) and "⋯" (Duplicate and Delete work, the rest are placeholders until
 * T9/T19). The idea itself lives in the editor store (`editor-store.ts`), open while this screen is.
 */
export function ProjectScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The native header floats over the content on iOS 26+, so start below it there. Android's
  // Material header is opaque and already sits above the content.
  const headerHeight = useHeaderHeight();
  const contentTop = Platform.OS === 'ios' ? headerHeight : 0;
  const params = useLocalSearchParams<{ id: string; record?: string }>();
  const router = useRouter();
  useOpenIdea(params.id);
  const isOpen = useEditorStore((state) => state.projectId === params.id);
  const project = useEditorStore((state) => (isOpen ? state.project : null));
  const loadFailed = useEditorStore((state) => isOpen && state.status === 'error');
  const saveError = useEditorStore((state) => state.saveError);
  const armedTrack = useEditorStore(selectArmedTrack);
  const preRoll = useEditorStore((state) => state.preRoll);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const transport = useTransport(project);
  const tracks = project?.tracks ?? [];

  const isRecording = transport.status === 'recording';
  const isPlaying = transport.status === 'playing';
  const isBusy = transport.status === 'starting' || transport.status === 'stopping';
  const isIdle = transport.status === 'idle';

  // The meter listens to the mic only while a track is armed and this screen is the one showing
  // (the track sheet on top, or another screen, releases it); recording feeds the meter itself.
  const focused = useIsFocused();
  const inputLevel = useInputMeter(!!armedTrack && isIdle && focused);
  const meterLevel = isRecording ? transport.level : inputLevel;
  const addTrackDisabled = !project || !isIdle;
  const undoDisabled = !isIdle || !canUndo;
  const redoDisabled = !isIdle || !canRedo;
  const hasClips = tracks.some((t) => t.clips.length > 0);

  const { record } = transport;
  const recordArmed = () => {
    if (armedTrack) void record(armedTrack.id);
  };

  // Quick capture: opened from "Record new idea", start recording as soon as the project is loaded.
  const autoRecordDone = useRef(false);
  const firstTrackId = params.record === '1' ? project?.tracks[0]?.id : undefined;
  useEffect(() => {
    if (!firstTrackId || autoRecordDone.current) return;
    autoRecordDone.current = true;
    void record(firstTrackId);
  }, [firstTrackId, record]);

  const onUndo = () => {
    void Haptics.selectionAsync();
    void undo();
  };
  const onRedo = () => {
    void Haptics.selectionAsync();
    void redo();
  };

  // While a volume slider moves: hear it at once (the engine also applies mute/solo on top).
  const previewVolume = (trackId: string, volume: number) => {
    const track = tracks.find((candidate) => candidate.id === trackId);
    if (track) setTrackGain(trackId, trackOutputGain({ ...track, volume }, hasSolo(tracks)));
  };

  // The "⋯" menu: only Duplicate and Delete do something yet (T10); the rest stay disabled.
  const duplicateProject = useDuplicateProject();
  const deleteProject = useDeleteProject();
  const menuActions: Partial<Record<IdeaMenuItemId, () => void>> = {
    duplicate: () => {
      duplicateProject.mutate(params.id, {
        onSuccess: (copy) => {
          if (copy) router.replace({ pathname: '/project/[id]', params: { id: copy.id } });
        },
      });
    },
    delete: () => {
      if (!project) return;
      confirmDeleteIdea(project.name, () => {
        router.back();
        deleteProject.mutate(params.id);
      });
    },
  };
  const menuEnabled = (id: IdeaMenuItemId) => !!project && isIdle && !!menuActions[id];

  const editTrack = (trackId: string) =>
    router.push({ pathname: '/track/[id]', params: { id: trackId, projectId: params.id } });

  // Time on the left, the meter on the right, toggles before it (T17's metronome goes next to
  // pre-roll). The clock turns red once the take has started (not during the run-up).
  const taking = isRecording && !transport.isPreRolling;
  const statusStrip = (
    <View style={styles.strip}>
      <Text
        variant="timecode"
        color={taking ? 'primary' : 'text'}
        accessibilityLabel={
          transport.isPreRolling ? 'Pre-roll time' : isRecording ? 'Recording time' : 'Time'
        }>
        {formatTimecode(transport.position)}
      </Text>
      <View style={styles.stripSpacer} />
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Pre-roll"
        accessibilityState={{ checked: preRoll, disabled: isRecording || isBusy }}
        disabled={isRecording || isBusy}
        hitSlop={8}
        onPress={() => {
          void Haptics.selectionAsync();
          void togglePreRoll();
        }}
        style={({ pressed }) => [
          styles.stripToggle,
          preRoll && styles.stripToggleOn,
          (isRecording || isBusy) && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <Icon
          name={{ ios: 'arrow.right.to.line', android: 'start' }}
          size={16}
          color={preRoll ? 'background' : 'textSecondary'}
        />
      </Pressable>
      <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.meterFill, { width: `${Math.round(meterLevel * 100)}%` }]} />
      </View>
    </View>
  );

  const backToStart = (
    <TransportButton
      label="Back to start"
      icon={{ ios: 'backward.end.fill', android: 'skip_previous' }}
      size={SIDE_BUTTON_SIZE}
      kind="secondary"
      disabled={isRecording || isBusy}
      onPress={transport.toStart}
    />
  );
  const playButton = (
    <TransportButton
      label={isPlaying ? 'Pause' : 'Play'}
      icon={
        isPlaying
          ? { ios: 'pause.fill', android: 'pause' }
          : { ios: 'play.fill', android: 'play_arrow' }
      }
      size={PLAY_BUTTON_SIZE}
      kind="play"
      disabled={isRecording || isBusy || !hasClips}
      onPress={isPlaying ? () => transport.stopPlaying() : () => void transport.startPlayback()}
    />
  );
  const recordButton = (
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
      disabled={isBusy || !armedTrack}
      onPress={isRecording ? () => void transport.stopRecording() : recordArmed}
    />
  );

  // Clip edits from the timeline (each one undo step); playback picks them up at once.
  const clipEditing: ClipEditing = {
    onPlace: (clipId, placement, label) => {
      const placed = placeClip(clipId, placement, label);
      if (placed) transport.replay();
      return placed;
    },
    onSplit: (clipId, at) => {
      if (splitClip(clipId, at)) transport.replay();
    },
    onDuplicate: (clipId) => {
      const copyId = duplicateClip(clipId);
      if (copyId) transport.replay();
      return copyId;
    },
    onDelete: (clipId) => {
      void deleteClip(clipId);
      transport.replay();
    },
  };

  const error = transport.error ?? saveError;
  const errorText = error ? (
    <Text color="danger" align="center" variant="footnote">
      {error}
    </Text>
  ) : null;

  const timeline = loadFailed ? (
    <View style={styles.message}>
      <Text color="danger" align="center">
        Couldn&apos;t open this idea.
      </Text>
    </View>
  ) : project ? (
    <Timeline
      project={project}
      playhead={transport.playhead}
      revealPlayhead={transport.revealPlayhead}
      following={isPlaying || isRecording}
      liveTake={transport.liveTake}
      armedTrackId={armedTrack?.id ?? null}
      addTrackDisabled={addTrackDisabled}
      clipEditing={isRecording || isBusy ? null : clipEditing}
      onSeek={transport.seek}
      onArm={(trackId) => void toggleArm(trackId)}
      onEditTrack={editTrack}
      onMoveTrack={(trackId, toIndex) => void moveTrack(trackId, toIndex)}
      onAddTrack={() => void addTrack()}
      onToggleMute={(trackId) => void toggleMute(trackId)}
      onToggleSolo={(trackId) => void toggleSolo(trackId)}
      onVolumeLive={previewVolume}
      onVolumeCommit={(trackId, gain) => void setTrackVolume(trackId, gain)}
    />
  ) : (
    <View style={styles.message} />
  );

  return (
    <View style={[styles.root, { paddingTop: contentTop }]}>
      {/* Android's Stack.Toolbar.Button draws only an image-source icon (no SF Symbols, no text) and
          renders nothing without one, so Android gets a plain header button with a Material Symbol. */}
      <Stack.Screen
        options={{
          title: project?.name ?? '',
          ...(Platform.OS === 'android' && {
            headerRight: () => (
              <View style={styles.headerButtons}>
                <HeaderIconButton
                  label="Undo"
                  icon={{ ios: 'arrow.uturn.backward', android: 'undo' }}
                  disabled={undoDisabled}
                  onPress={onUndo}
                />
                <HeaderIconButton
                  label="Redo"
                  icon={{ ios: 'arrow.uturn.forward', android: 'redo' }}
                  disabled={redoDisabled}
                  onPress={onRedo}
                />
                <AndroidHeaderMenu
                  label="More"
                  icon={{ ios: 'ellipsis', android: 'more_vert' }}
                  items={IDEA_MENU_ITEMS.map((item) => ({
                    label: item.label,
                    disabled: !menuEnabled(item.id),
                    onPress: menuActions[item.id],
                  }))}
                />
              </View>
            ),
          }),
        }}
      />
      {Platform.OS === 'ios' && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="arrow.uturn.backward"
            accessibilityLabel="Undo"
            disabled={undoDisabled}
            onPress={onUndo}>
            Undo
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            icon="arrow.uturn.forward"
            accessibilityLabel="Redo"
            disabled={redoDisabled}
            onPress={onRedo}>
            Redo
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="More">
            {IDEA_MENU_ITEMS.map((item) => (
              <Stack.Toolbar.MenuAction
                key={item.label}
                icon={item.icon.ios}
                destructive={item.destructive}
                disabled={!menuEnabled(item.id)}
                onPress={menuActions[item.id]}>
                {item.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}

      {statusStrip}
      {errorText}
      <View style={styles.timeline}>{timeline}</View>
      {/* Android's gesture bar reports almost no inset, so it gets more room under the buttons. */}
      <View
        style={[
          styles.transport,
          {
            paddingBottom:
              insets.bottom + (Platform.OS === 'android' ? theme.spacing.lg : theme.spacing.sm),
          },
        ]}>
        {/* The outer two share a size, so Play stays centered. */}
        <View style={styles.buttons}>
          {backToStart}
          {playButton}
          {recordButton}
        </View>
      </View>
    </View>
  );
}

/** Icon-only header action for Android (see the Stack.Screen comment above). */
function HeaderIconButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={24} />
    </Pressable>
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
        size={Math.round(size * (kind === 'record' ? 0.55 : 0.42))}
        style={kind === 'record' ? styles.recordIcon : undefined}
        color={kind === 'record' ? 'onPrimary' : kind === 'play' ? 'background' : 'text'}
      />
    </Pressable>
  );
}

const PLAY_BUTTON_SIZE = 60;
const SIDE_BUTTON_SIZE = 44;

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.background },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  stripSpacer: { flex: 1 },
  stripToggle: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xxs,
    borderRadius: t.radius.full,
  },
  stripToggleOn: { backgroundColor: t.colors.text },
  meter: {
    width: 96,
    height: t.spacing.xs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceMuted,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: t.colors.success },
  timeline: { flex: 1 },
  message: { flex: 1, justifyContent: 'center', padding: t.spacing.lg },
  transport: {
    paddingTop: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
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
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { padding: t.spacing.sm, borderRadius: t.radius.full },
  recordButton: { backgroundColor: t.colors.primary },
  // SF Symbols sit about a pixel low in their box; nudge up so the glyph looks centered.
  recordIcon: { marginTop: -1 },
  playButton: { backgroundColor: t.colors.text },
  secondaryButton: { backgroundColor: t.colors.surfacePressed },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
}));
