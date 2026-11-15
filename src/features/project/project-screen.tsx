import * as Haptics from 'expo-haptics';
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AndroidHeaderMenu } from '@/components/android-header-menu';
import { RenameDialog } from '@/components/rename-dialog';
import { Icon, Text, type IconName } from '@/components/ui';
import { setTrackGain } from '@/features/audio/audio-engine';
import { formatTimecode } from '@/features/audio/format-time';
import { showsBeats } from '@/features/audio/metronome';
import { confirmDeleteIdea } from '@/features/projects/idea-actions';
import {
  useDeleteProject,
  useDuplicateProject,
  useIsFavorite,
  useSetFavorite,
} from '@/features/projects/queries';
import { Timeline, type ClipEditing, type SectionEditing } from '@/features/timeline/timeline';
import { makeStyles, useTheme } from '@/theme';

import { BeatDisplay } from './beat-display';
import {
  addTrack,
  deleteClip,
  deleteSection,
  duplicateClip,
  moveTrack,
  placeClip,
  placeSection,
  redo,
  renameSection,
  selectArmedTrack,
  splitClip,
  selectCanRedo,
  selectCanUndo,
  setIdeaSettings,
  setLoopRegion,
  setSectionColor,
  setTrackVolume,
  toggleMute,
  toggleArm,
  toggleLoop,
  toggleMetronome,
  togglePreRoll,
  toggleSnap,
  toggleSolo,
  undo,
  useEditorStore,
  useOpenIdea,
} from './editor-store';
import { IDEA_MENU_ITEMS, type IdeaMenuItemId } from './idea-menu-items';
import { hasNotes } from './idea-notes';
import { hasSolo, trackOutputGain } from './mixer';
import { SECTION_NAME_MAX } from './sections';
import { registerTransportLink } from './transport-link';
import { useInputMeter } from './use-input-meter';
import { useSpeakerRecording } from './use-speaker-mode';
import { useTransport } from './use-transport';

/**
 * The project editor: a thin status strip (clock, metronome and snap toggles, meter), the beat
 * display while the metronome is on and shown (Visual / Both, `beat-display.tsx`), the timeline, then a compact transport row (Loop toggle on the left, Back to start · Play · Record, pre-roll toggle on the right). With
 * Loop on, playback repeats the region set on the ruler (T26); Record ignores it. Record while
 * playing punches in on the fly; with pre-roll on, Record starts with a run-up (`use-transport.ts`). The app is portrait-only
 * (`orientation` in app.json), so there is no landscape layout. One track is
 * armed: Record records onto it while the others play. Tracks are added from the timeline's
 * "+ New Track" row. The header has Undo, Redo (enabled only while idle) and "⋯" (Idea settings, Notes, Duplicate,
 * Favorite / Unfavorite (T19), Delete). The strip's Notes button (dot = has notes) opens the idea notes sheet (T24),
 * the keyboard button the pitch reference keyboard (T20). The idea itself lives in the editor store (`editor-store.ts`), open while this screen is.
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
  const snap = useEditorStore((state) => state.snap);
  const metronome = useEditorStore((state) => state.metronome);
  const loopOn = useEditorStore((state) => state.loopOn);
  const loopRegion = useEditorStore((state) => state.loopRegion);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const speakerRecording = useSpeakerRecording();
  const transport = useTransport(project, speakerRecording);
  const tracks = project?.tracks ?? [];

  // Sheets over the idea (notes, clip options) read and move the playhead through this.
  const { playhead, revealPlayhead, seek, replay } = transport;
  useEffect(() =>
    registerTransportLink({
      playheadTime: () => playhead.get(),
      seek: (time) => {
        seek(time);
        revealPlayhead.set(revealPlayhead.get() + 1);
      },
      replay,
    }),
  );

  const isRecording = transport.status === 'recording';
  const isPlaying = transport.status === 'playing';
  const isBusy = transport.status === 'starting' || transport.status === 'stopping';
  const isIdle = transport.status === 'idle';

  // The meter listens to the mic only while a track is armed and this screen is the one showing
  // (the track sheet on top, or another screen, releases it); recording feeds the meter itself.
  const focused = useIsFocused();
  const inputMeter = useInputMeter(!!armedTrack && isIdle && focused);
  const meterLevel = isRecording ? transport.level : inputMeter.level;
  // Red with a peak-hold mark at the end while the input clips (T38).
  const meterClipped = isRecording ? transport.clipped : inputMeter.clipped;
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

  // The "⋯" menu. Starring isn't an undoable edit: it's read from and written to the Ideas list.
  const duplicateProject = useDuplicateProject();
  const deleteProject = useDeleteProject();
  const isFavorite = useIsFavorite(params.id).data ?? false;
  const setFavorite = useSetFavorite();
  const menuItems = IDEA_MENU_ITEMS.map((item) =>
    item.id === 'favorite' && isFavorite
      ? { ...item, label: 'Unfavorite', icon: { ...item.icon, ios: 'star.fill' as const } }
      : item,
  );
  const openNotes = () => router.push({ pathname: '/idea-notes/[id]', params: { id: params.id } });
  const menuActions: Partial<Record<IdeaMenuItemId, () => void>> = {
    settings: () => router.push({ pathname: '/idea-settings/[id]', params: { id: params.id } }),
    notes: openNotes,
    export: () => router.push({ pathname: '/export/[id]', params: { id: params.id } }),
    duplicate: () => {
      duplicateProject.mutate(params.id, {
        onSuccess: (copy) => {
          if (copy) router.replace({ pathname: '/project/[id]', params: { id: copy.id } });
        },
      });
    },
    favorite: () => setFavorite.mutate({ ids: [params.id], favorite: !isFavorite }),
    delete: () => {
      if (!project) return;
      confirmDeleteIdea(project.name, () => {
        router.back();
        deleteProject.mutate(params.id);
      });
    },
  };
  // Notes stay available while playing or recording (jot down what's happening, jump to a time).
  const menuEnabled = (id: IdeaMenuItemId) =>
    !!project && (isIdle || id === 'notes') && !!menuActions[id];

  const editTrack = (trackId: string) =>
    router.push({ pathname: '/track/[id]', params: { id: trackId, projectId: params.id } });

  // Time on the left, the meter on the right, toggles before it. The clock turns red once the take
  // has started (not during the run-up). Pre-roll is fixed while recording; the metronome can be
  // switched any time (it applies live), except while the transport starts or stops.
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
      <StripButton
        label="Notes"
        icon={{ ios: 'note.text', android: 'notes' }}
        badge={!!project && hasNotes(project.notes)}
        disabled={!project}
        onPress={openNotes}
      />
      <StripButton
        label="Pitch keyboard"
        icon={{ ios: 'pianokeys', android: 'piano' }}
        badge={false}
        disabled={false}
        onPress={() => router.push('/pitch-keyboard')}
      />
      <StripToggle
        label="Metronome"
        icon={{ ios: 'metronome', android: 'timer' }}
        on={metronome}
        disabled={isBusy || !project}
        onPress={() => void toggleMetronome()}
      />
      <StripToggle
        label="Snap to grid"
        icon={{ ios: 'square.grid.3x3', android: 'grid_on' }}
        on={snap && !!project?.grid}
        disabled={!project?.grid}
        onPress={() => void toggleSnap()}
      />
      <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no">
        <View
          style={[
            styles.meterFill,
            meterClipped && styles.meterFillClipped,
            { width: `${Math.round(meterLevel * 100)}%` },
          ]}
        />
        {meterClipped ? <View style={styles.meterClip} /> : null}
      </View>
    </View>
  );

  // The visual metronome, under the strip; also while recording in silence (T34), where it's the only
  // way to keep time. In Speaker mode (no headphones) a clicking metronome bleeds into the take, so
  // suggest Visual before recording; dismissed until the screen is left. Not needed when the take is
  // recorded in silence.
  const beatDisplay =
    project && metronome && (showsBeats(project.metronomeOutput) || transport.isSilentRecording) ? (
      <BeatDisplay clock={transport.beatClock} meter={project} />
    ) : null;
  const [visualHintDismissed, setVisualHintDismissed] = useState(false);
  const visualHint =
    project &&
    speakerRecording.clean &&
    metronome &&
    project.metronomeOutput !== 'visual' &&
    armedTrack &&
    isIdle &&
    !visualHintDismissed ? (
      <View style={styles.hint}>
        <Text variant="footnote" color="textSecondary" style={styles.hintText}>
          No headphones: the click can bleed into the take.
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            void Haptics.selectionAsync();
            void setIdeaSettings({ metronomeOutput: 'visual' });
          }}
          style={({ pressed }) => [styles.hintButton, pressed && styles.pressed]}>
          <Text variant="footnote" color="primary">
            Use Visual
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          onPress={() => setVisualHintDismissed(true)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Icon name={{ ios: 'xmark', android: 'close' }} size={14} color="textSecondary" />
        </Pressable>
      </View>
    ) : null;

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
  // Loop (T26) and Pre-roll (T25) flank the buttons as plain icons, Loop left of Back to start,
  // Pre-roll right of Record. Looping applies at once, also mid-playback (`replay`).
  const loopToggle = (
    <StripToggle
      label="Loop"
      icon={{ ios: 'repeat', android: 'repeat' }}
      on={loopOn}
      disabled={isRecording || isBusy || !project}
      onPress={() => {
        void toggleLoop(transport.playhead.get());
        transport.replay();
      }}
    />
  );
  const preRollToggle = (
    <StripToggle
      label="Pre-roll"
      icon={{ ios: 'arrow.right.to.line', android: 'start' }}
      on={preRoll}
      disabled={isRecording || isBusy}
      onPress={() => void togglePreRoll()}
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
    onOptions: (clipId) =>
      router.push({ pathname: '/clip-options/[id]', params: { id: clipId, projectId: params.id } }),
    onDelete: (clipId) => {
      void deleteClip(clipId);
      transport.replay();
    },
  };

  // Section edits from the rail (T18), each one undo step. Adding and notes open sheets over the idea.
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const renamingSection = project?.sections.find((section) => section.id === renamingSectionId);
  const sectionEditing: SectionEditing = {
    onAdd: (window) =>
      router.push({
        pathname: '/new-section',
        params: {
          projectId: params.id,
          start: String(window.start),
          duration: String(window.duration),
        },
      }),
    onPlace: placeSection,
    onRename: setRenamingSectionId,
    onColor: (sectionId, color) => void setSectionColor(sectionId, color),
    onNotes: (sectionId) =>
      router.push({
        pathname: '/section-notes/[id]',
        params: { id: sectionId, projectId: params.id },
      }),
    onDelete: (sectionId) => void deleteSection(sectionId),
  };

  const error = transport.error ?? saveError;
  const errorText = transport.isCleaning ? (
    <Text color="textSecondary" align="center" variant="footnote">
      Cleaning up take…
    </Text>
  ) : error ? (
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
      snap={snap}
      loopOn={loopOn}
      loopRegion={loopRegion}
      armedTrackId={armedTrack?.id ?? null}
      addTrackDisabled={addTrackDisabled}
      clipEditing={isRecording || isBusy ? null : clipEditing}
      sectionEditing={isRecording || isBusy ? null : sectionEditing}
      onSeek={transport.seek}
      onLoopRegionChange={(region) => {
        void setLoopRegion(region);
        transport.replay();
      }}
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
                  items={menuItems.map((item) => ({
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
            {menuItems.map((item) => (
              <Stack.Toolbar.MenuAction
                key={item.id}
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
      {beatDisplay}
      {visualHint}
      {errorText}
      <View style={styles.timeline}>{timeline}</View>
      <RenameDialog
        item={renamingSection ?? null}
        title="Rename section"
        inputLabel="Section name"
        maxLength={SECTION_NAME_MAX}
        onCancel={() => setRenamingSectionId(null)}
        onSubmit={(sectionId, name) => {
          setRenamingSectionId(null);
          void renameSection(sectionId, name);
        }}
      />
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
          <View style={styles.sideSlot}>{loopToggle}</View>
          {backToStart}
          {playButton}
          {recordButton}
          <View style={styles.sideSlot}>{preRollToggle}</View>
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

/** An icon-only on/off switch in the status strip (filled when on). */
function StripToggle({
  label,
  icon,
  on,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.stripToggle,
        on && styles.stripToggleOn,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={16} color={on ? 'background' : 'textSecondary'} />
    </Pressable>
  );
}

/** An icon-only button in the status strip that opens something; `badge` adds a dot (e.g. "has notes"). */
function StripButton({
  label,
  icon,
  badge,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  badge: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={badge ? { text: 'Has content' } : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.stripToggle,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={16} color="textSecondary" />
      {badge ? <View style={styles.badge} /> : null}
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
/** The two slots flanking the transport buttons (the Loop and pre-roll toggles). */
const SIDE_SLOT_WIDTH = 36;

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
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.xs,
  },
  hintText: { flex: 1 },
  hintButton: { paddingVertical: t.spacing.xxs },
  stripToggle: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xxs,
    borderRadius: t.radius.full,
  },
  stripToggleOn: { backgroundColor: t.colors.text },
  badge: {
    position: 'absolute',
    top: 0,
    right: t.spacing.xxs,
    width: 7,
    height: 7,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primary,
  },
  // Gives way first when the strip gets crowded (narrow phones).
  meter: {
    width: 96,
    minWidth: 40,
    flexShrink: 1,
    height: t.spacing.xs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceMuted,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: t.colors.success },
  meterFillClipped: { backgroundColor: t.colors.danger },
  meterClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 4,
    backgroundColor: t.colors.danger,
  },
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
  sideSlot: { width: SIDE_SLOT_WIDTH, alignItems: 'center', justifyContent: 'center' },
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
