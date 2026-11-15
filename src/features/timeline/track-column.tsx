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
import { clamp, GRIP_BAND, PILL_BAND } from './timeline-math';
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
 * In the vertical timeline (T43) it's the header row along the top instead, one cell per lane column,
 * following the lanes' sideways scroll: a band with the grab handle (in the mixer, the info button) over a
 * band left free for the track's name pill (drawn by `LaneOverlay`); the mixer grows the row down with
 * Mute · Solo and the volume slider under the name. Tracks are dragged left / right.
 *
 * The drag lives in shared values (`drag`, read by the lanes and name pills too) and runs on the UI
 * thread; only the drop reaches JS.
 */
export function TrackColumn({
  tracks,
  start,
  size,
  armWidth,
  expanded,
  vertical = false,
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
  /** Where the lanes start across time (below the ruler, or right of it when vertical). */
  start: number;
  /** The column's width (the row's height when vertical). */
  size: number;
  /** Width of the collapsed column: the grab handle, and the info button's area in the mixer. */
  armWidth: number;
  /** Show the mixer controls. */
  expanded: boolean;
  /** The header row of the vertical timeline instead of the column. */
  vertical?: boolean;
  lane: number;
  laneScroll: SharedValue<number>;
  /** Visible length of the lanes area across time, and how far it can scroll. */
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
  const scrolled = useAnimatedStyle(() => ({
    transform: [vertical ? { translateX: -laneScroll.get() } : { translateY: -laneScroll.get() }],
  }));
  const trackIds = tracks.map((track) => track.id);
  const count = tracks.length;
  const reorderable = !expanded && !editDisabled && count > 1;

  /** The gesture picked a track up (it can be a long press below the last track: nothing). */
  const active = useSharedValue(false);
  /** Finger position across time (y in the column, x in the row), and where the drag started (finger, lane top, scroll). */
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
      const index = Math.floor(((vertical ? event.x : event.y) + laneScroll.get()) / lane);
      if (index < 0 || index >= count) return;
      pressIndex.set(index);
      press.set(PRESS_START);
      press.set(withTiming(1, { duration: LONG_PRESS_MS }));
    },
    onActivate: (event) => {
      'worklet';
      cancelAnimation(laneScroll);
      const scroll = laneScroll.get();
      const along = vertical ? event.x : event.y;
      const index = Math.floor((along + scroll) / lane);
      const id = trackIds[index];
      if (id == null) return;
      active.set(true);
      // The lift takes over from the press highlight.
      press.set(withTiming(0, { duration: LIFT_MS }));
      finger.set(along);
      startFinger.set(along);
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
      finger.set(vertical ? event.x : event.y);
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
      <View
        style={[
          styles.viewport,
          vertical
            ? [styles.rowViewport, { left: start, height: size }]
            : [styles.columnViewport, { top: start, width: size }],
        ]}>
        <Animated.View style={[vertical && styles.row, scrolled]}>
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
              size={size}
              armWidth={armWidth}
              expanded={expanded}
              vertical={vertical}
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
  size,
  armWidth,
  expanded,
  vertical,
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
  /** The row's height (vertical). */
  size: number;
  armWidth: number;
  expanded: boolean;
  vertical: boolean;
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
    axis: vertical ? 'x' : 'y',
  });
  const pressed = useAnimatedStyle(() => ({
    opacity: pressIndex.get() === index ? press.get() : 0,
  }));
  const [back, forward] = vertical
    ? [
        { name: 'moveLeft', label: 'Move left' },
        { name: 'moveRight', label: 'Move right' },
      ]
    : [
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
      ];
  const moves = reorderable
    ? [...(index > 0 ? [back] : []), ...(index < count - 1 ? [forward] : [])]
    : [];

  const info = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${track.name} settings`}
      accessibilityState={{ disabled: editDisabled }}
      disabled={editDisabled}
      hitSlop={8}
      onPress={() => onEdit(track.id)}
      style={({ pressed: down }) => [
        styles.info,
        vertical && styles.infoBand,
        editDisabled && styles.disabled,
        down && styles.pressed,
      ]}>
      <Icon
        name={{ ios: 'info.circle', android: 'info' }}
        size={vertical ? 18 : 22}
        color="textSecondary"
      />
    </Pressable>
  );
  const toggles = (
    <>
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
    </>
  );
  const slider = (
    <VolumeSlider
      label={`${track.name} volume`}
      gain={gain}
      dimmed={silent}
      onDrag={(next) => onVolumeDrag(track.id, next)}
      onRelease={(next) => onVolumeRelease(track.id, next)}
    />
  );
  const highlight = <Animated.View pointerEvents="none" style={[styles.pressHighlight, pressed]} />;
  const grip = (
    <View
      style={vertical ? styles.gripBand : [styles.armArea, { width: armWidth }]}
      accessible={reorderable}
      accessibilityLabel={`Reorder ${track.name}`}
      accessibilityHint={`Touch and hold, then drag to move the track`}
      accessibilityActions={moves}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        const step = name === 'moveUp' || name === 'moveLeft' ? -1 : 1;
        onMoveTrack(track.id, index + step);
      }}>
      <Icon
        name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }}
        size={14}
        color="textSecondary"
        style={[styles.grip, vertical && styles.gripTurned]}
      />
    </View>
  );

  if (vertical) {
    return (
      <Animated.View style={[styles.cellVertical, { width: lane, height: size }, reorder]}>
        {expanded ? null : highlight}
        {expanded ? <View style={styles.gripBand}>{info}</View> : grip}
        {/* The track's name pill (LaneOverlay) sits in this band. */}
        <View style={styles.pillBand} />
        {expanded ? (
          <View style={styles.mixerStack}>
            <View style={styles.toggles}>{toggles}</View>
            <View style={styles.sliderRow}>{slider}</View>
          </View>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.cell, { height: lane }, expanded && styles.cellMixer, reorder]}>
      {expanded ? (
        <View style={styles.mixer}>
          <View style={[styles.armArea, { width: armWidth }]}>{info}</View>
          {toggles}
          {slider}
        </View>
      ) : (
        highlight
      )}
      {expanded ? null : grip}
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
  viewport: { position: 'absolute', overflow: 'hidden', backgroundColor: t.colors.background },
  columnViewport: { left: 0, bottom: 0 },
  // The vertical timeline's header row: along the top, right of the rail and ruler.
  rowViewport: { top: 0, right: 0 },
  row: { flexDirection: 'row' },
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
  cellVertical: {
    // A hairline between columns (like the lanes' separators) and a solid bottom edge on the row.
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.colors.border,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  gripBand: { height: GRIP_BAND, alignItems: 'center', justifyContent: 'center' },
  pillBand: { height: PILL_BAND },
  mixerStack: { gap: t.spacing.xs, paddingHorizontal: t.spacing.xs },
  toggles: { flexDirection: 'row', justifyContent: 'center', gap: t.spacing.sm },
  sliderRow: { flexDirection: 'row' },
  armArea: { alignItems: 'center', justifyContent: 'center' },
  info: { width: INFO_SIZE, height: INFO_SIZE, alignItems: 'center', justifyContent: 'center' },
  infoBand: { height: GRIP_BAND },
  grip: { opacity: 0.6 },
  // The grip runs across a column: tracks move left / right.
  gripTurned: { transform: [{ rotate: '90deg' }] },
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
