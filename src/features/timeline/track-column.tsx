import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, Text } from '@/components/ui';
import type { Track } from '@/features/projects/projects-repo';
import { makeStyles, useTheme } from '@/theme';

import { autoScrollSpeed, dropIndex } from './reorder-math';
import { clamp } from './timeline-math';
import { useReorderStyle, type TrackDrag } from './use-reorder-style';
import { VolumeSlider } from './volume-slider';

const INFO_SIZE = 30;
const TOGGLE_SIZE = 30;
/** Hold a grab handle this long to pick the track up (moving before that cancels it). */
const LONG_PRESS_MS = 175;
/** The press highlight starts at this opacity on touch down and fills to 1 by pickup. */
const PRESS_START = 0.35;
const PRESS_FADE_MS = 150;
const LIFT_MS = 150;
/** Lanes gliding aside as the drop slot changes. */
const SHIFT_MS = 150;
/** The dropped track settling into its slot (longer than `SHIFT_MS`, so the others have arrived). */
const SETTLE_MS = 180;
/** Dragging within this distance of the top / bottom edge scrolls the lanes, up to `AUTO_SCROLL_SPEED`. */
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_SPEED = 700;

/** A volume slider being dragged: its live gain, shown before it's saved. */
export type FaderDraft = { trackId: string; gain: number };

/**
 * The pinned track-controls column left of the lanes, one cell per lane. Collapsed, each cell is just a
 * track's grab handle (a faint grip glyph): long-press it to pick the track up, drag, let go to drop it
 * in a new place (one `onMoveTrack`). Near the top / bottom edge the lanes scroll along. Expanded (the
 * mixer) each cell is an info button (opens the track's sheet: rename, delete), Mute, Solo and a volume
 * slider, and there's no reordering. Arming happens on the track's name pill over the lanes. It follows
 * the lanes' vertical scroll (`laneScroll`) but never scrolls with time.
 *
 * The drag lives in shared values (`drag`, read by the lanes and name pills too) and runs on the UI
 * thread; only the drop reaches JS.
 */
export function TrackColumn({
  tracks,
  top,
  width,
  armWidth,
  expanded,
  lane,
  laneScroll,
  viewport,
  maxLaneScroll,
  drag,
  editDisabled,
  anySolo,
  draft,
  onEdit,
  onMoveTrack,
  onToggleMute,
  onToggleSolo,
  onVolumeDrag,
  onVolumeRelease,
}: {
  tracks: Pick<Track, 'id' | 'name' | 'volume' | 'muted' | 'solo'>[];
  /** Where the lanes start (below the ruler). */
  top: number;
  width: number;
  /** Width of the collapsed column: the grab handle, and the info button's area in the mixer. */
  armWidth: number;
  /** Show the mixer controls. */
  expanded: boolean;
  lane: number;
  laneScroll: SharedValue<number>;
  /** Visible height of the lanes area, and how far it can scroll. */
  viewport: number;
  maxLaneScroll: number;
  drag: TrackDrag;
  /** While recording: tracks can't be edited (or reordered). */
  editDisabled: boolean;
  /** Some track is soloed, so tracks that aren't are silent. */
  anySolo: boolean;
  draft: FaderDraft | null;
  /** Open the track's sheet. */
  onEdit: (trackId: string) => void;
  /** A track was dropped at `toIndex` (also the screen reader's Move up / Move down). */
  onMoveTrack: (trackId: string, toIndex: number) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onVolumeDrag: (trackId: string, gain: number) => void;
  onVolumeRelease: (trackId: string, gain: number) => void;
}) {
  const styles = useStyles();
  const scrolled = useAnimatedStyle(() => ({ transform: [{ translateY: -laneScroll.get() }] }));
  const trackIds = tracks.map((track) => track.id);
  const count = tracks.length;
  const reorderable = !expanded && !editDisabled && count > 1;

  /** The gesture picked a track up (it can be a long press below the last track: nothing). */
  const active = useSharedValue(false);
  /** Finger y in the column, and where the drag started (finger, lane top, scroll). */
  const finger = useSharedValue(0);
  const startFinger = useSharedValue(0);
  const startTop = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const target = drag.target;
  /** The grip being held (before pickup), and how far along the hold is (0…1). */
  const pressIndex = useSharedValue(-1);
  const press = useSharedValue(0);

  // Places the lifted lane under the finger (scrolling included) and moves the drop slot.
  const follow = () => {
    'worklet';
    const moved = finger.get() - startFinger.get() + (laneScroll.get() - startScroll.get());
    const top = clamp(startTop.get() + moved, 0, (count - 1) * lane);
    drag.top.set(top);
    const slot = dropIndex(top, lane, count);
    if (slot !== target.get()) {
      target.set(slot);
      drag.progress.set(withTiming(slot, { duration: SHIFT_MS }));
    }
  };

  // Auto-scroll while the finger is near an edge; runs only during a drag.
  const autoScroll = useFrameCallback((frame) => {
    'worklet';
    if (!active.get()) return;
    const speed = autoScrollSpeed(finger.get(), viewport, AUTO_SCROLL_EDGE, AUTO_SCROLL_SPEED);
    if (speed === 0) return;
    const seconds = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const next = clamp(laneScroll.get() + speed * seconds, 0, maxLaneScroll);
    if (next === laneScroll.get()) return;
    laneScroll.set(next);
    follow();
  }, false);

  const lifted = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    autoScroll.setActive(true);
  };
  const released = () => autoScroll.setActive(false);

  const pan = usePanGesture({
    enabled: reorderable,
    activateAfterLongPress: LONG_PRESS_MS,
    // Touch down: the grip lights up at once and fills in over the hold, so it's clear that holding
    // (not dragging yet) picks the track up.
    onBegin: (event) => {
      'worklet';
      const index = Math.floor((event.y + laneScroll.get()) / lane);
      if (index < 0 || index >= count) return;
      pressIndex.set(index);
      press.set(PRESS_START);
      press.set(withTiming(1, { duration: LONG_PRESS_MS }));
    },
    onActivate: (event) => {
      'worklet';
      cancelAnimation(laneScroll);
      const scroll = laneScroll.get();
      const index = Math.floor((event.y + scroll) / lane);
      const id = trackIds[index];
      if (id == null) return;
      active.set(true);
      // The lift takes over from the press highlight.
      press.set(withTiming(0, { duration: LIFT_MS }));
      finger.set(event.y);
      startFinger.set(event.y);
      startScroll.set(scroll);
      startTop.set(index * lane);
      target.set(index);
      cancelAnimation(drag.top);
      cancelAnimation(drag.progress);
      drag.top.set(index * lane);
      drag.progress.set(index);
      drag.dropped.set(-1);
      drag.id.set(id);
      drag.lift.set(withTiming(1, { duration: LIFT_MS }));
      scheduleOnRN(lifted);
    },
    onUpdate: (event) => {
      'worklet';
      if (!active.get()) return;
      finger.set(event.y);
      follow();
    },
    onFinalize: () => {
      'worklet';
      press.set(withTiming(0, { duration: PRESS_FADE_MS }));
      if (!active.get()) return;
      active.set(false);
      scheduleOnRN(released);
      const id = drag.id.get();
      const to = target.get();
      const moved = id != null && trackIds.indexOf(id) !== to;
      // Settle into the slot first (the other lanes have arrived by then), then save. The track stays
      // "lifted" at lift 0 until the new order renders, so nothing snaps.
      drag.top.set(withTiming(to * lane, { duration: SETTLE_MS }));
      drag.lift.set(
        withTiming(0, { duration: SETTLE_MS }, (finished) => {
          if (!finished || id == null) return;
          // `useTrackDrag` clears the drag once the order has it in this slot.
          drag.dropped.set(to);
          if (moved) scheduleOnRN(onMoveTrack, id, to);
        }),
      );
    },
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.viewport, { top, width }]}>
        <Animated.View style={scrolled}>
          {tracks.map((track, index) => (
            <ColumnCell
              key={track.id}
              track={track}
              index={index}
              count={count}
              trackIds={trackIds}
              drag={drag}
              pressIndex={pressIndex}
              press={press}
              lane={lane}
              armWidth={armWidth}
              expanded={expanded}
              reorderable={reorderable}
              editDisabled={editDisabled}
              silent={anySolo ? !track.solo : track.muted}
              gain={draft?.trackId === track.id ? draft.gain : track.volume}
              onEdit={onEdit}
              onMoveTrack={onMoveTrack}
              onToggleMute={onToggleMute}
              onToggleSolo={onToggleSolo}
              onVolumeDrag={onVolumeDrag}
              onVolumeRelease={onVolumeRelease}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** One track's cell: its grab handle (collapsed) or its mixer controls (expanded). */
function ColumnCell({
  track,
  index,
  count,
  trackIds,
  drag,
  pressIndex,
  press,
  lane,
  armWidth,
  expanded,
  reorderable,
  editDisabled,
  silent,
  gain,
  onEdit,
  onMoveTrack,
  onToggleMute,
  onToggleSolo,
  onVolumeDrag,
  onVolumeRelease,
}: {
  track: Pick<Track, 'id' | 'name' | 'muted' | 'solo'>;
  index: number;
  count: number;
  trackIds: string[];
  drag: TrackDrag;
  pressIndex: SharedValue<number>;
  press: SharedValue<number>;
  lane: number;
  armWidth: number;
  expanded: boolean;
  reorderable: boolean;
  editDisabled: boolean;
  silent: boolean;
  gain: number;
  onEdit: (trackId: string) => void;
  onMoveTrack: (trackId: string, toIndex: number) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onVolumeDrag: (trackId: string, gain: number) => void;
  onVolumeRelease: (trackId: string, gain: number) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reorder = useReorderStyle(index, trackIds, drag, lane, {
    shadow: true,
    stripes: [colors.background, colors.laneAlt],
    liftedBackground: colors.laneLifted,
  });
  const pressed = useAnimatedStyle(() => ({
    opacity: pressIndex.get() === index ? press.get() : 0,
  }));
  const moves = reorderable
    ? [
        ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
        ...(index < count - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
      ]
    : [];

  return (
    <Animated.View style={[styles.cell, { height: lane }, expanded && styles.cellMixer, reorder]}>
      {expanded ? (
        <View style={styles.mixer}>
          <View style={[styles.armArea, { width: armWidth }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${track.name} settings`}
              accessibilityState={{ disabled: editDisabled }}
              disabled={editDisabled}
              hitSlop={8}
              onPress={() => onEdit(track.id)}
              style={({ pressed }) => [
                styles.info,
                editDisabled && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Icon
                name={{ ios: 'info.circle', android: 'info' }}
                size={22}
                color="textSecondary"
              />
            </Pressable>
          </View>
          <MixerToggle
            label={`Mute ${track.name}`}
            letter="M"
            active={track.muted}
            kind="mute"
            onPress={() => onToggleMute(track.id)}
          />
          <MixerToggle
            label={`Solo ${track.name}`}
            letter="S"
            active={track.solo}
            kind="solo"
            onPress={() => onToggleSolo(track.id)}
          />
          <VolumeSlider
            label={`${track.name} volume`}
            gain={gain}
            dimmed={silent}
            onDrag={(next) => onVolumeDrag(track.id, next)}
            onRelease={(next) => onVolumeRelease(track.id, next)}
          />
        </View>
      ) : (
        <Animated.View pointerEvents="none" style={[styles.pressHighlight, pressed]} />
      )}
      {expanded ? null : (
        <View
          style={[styles.armArea, { width: armWidth }]}
          accessible={reorderable}
          accessibilityLabel={`Reorder ${track.name}`}
          accessibilityHint="Touch and hold, then drag to move the track"
          accessibilityActions={moves}
          onAccessibilityAction={(event) => {
            const step = event.nativeEvent.actionName === 'moveUp' ? -1 : 1;
            onMoveTrack(track.id, index + step);
          }}>
          <Icon
            name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }}
            size={14}
            color="textSecondary"
            style={styles.grip}
          />
        </View>
      )}
    </Animated.View>
  );
}

/** Mute (M) or Solo (S): a small square toggle, filled when on. */
function MixerToggle({
  label,
  letter,
  active,
  kind,
  onPress,
}: {
  label: string;
  letter: string;
  active: boolean;
  kind: 'mute' | 'solo';
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.toggle,
        active && (kind === 'mute' ? styles.muteOn : styles.soloOn),
        pressed && styles.pressed,
      ]}>
      <Text
        variant="footnote"
        color={active ? (kind === 'mute' ? 'onMute' : 'onSolo') : 'textSecondary'}
        style={styles.toggleText}>
        {letter}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  viewport: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: t.colors.background,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    // A solid right edge on each track's cell (same as the mixer toggle's), ending at the last track.
    borderRightWidth: 1,
    borderRightColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  cellMixer: { paddingHorizontal: t.spacing.sm },
  armArea: { alignItems: 'center', justifyContent: 'center' },
  info: { width: INFO_SIZE, height: INFO_SIZE, alignItems: 'center', justifyContent: 'center' },
  grip: { opacity: 0.6 },
  pressHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.colors.surfacePressed,
  },
  mixer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  toggle: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: t.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfacePressed,
  },
  toggleText: { fontWeight: '700' },
  muteOn: { backgroundColor: t.colors.mute },
  soloOn: { backgroundColor: t.colors.solo },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
