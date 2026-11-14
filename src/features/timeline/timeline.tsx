import {
  BlurStyle,
  Canvas,
  ClipOp,
  createPicture,
  matchFont,
  PaintStyle,
  Picture,
  Skia,
  type SkCanvas,
  type SkPaint,
  type SkPath,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Icon } from '@/components/ui';
import { barSeconds, beatSeconds, isCompound } from '@/features/audio/tempo';
import { canSplitAt, MIN_CLIP_SECONDS, type ClipPlacement } from '@/features/project/edit-commands';
import type { Project } from '@/features/projects/projects-repo';
import { useTheme, type ThemeColors } from '@/theme';

import { ClipActionBar } from './clip-action-bar';
import {
  DRAG_MOVE,
  DRAG_NONE,
  dragWindow,
  grabPart,
  itemAt,
  rowAt,
  snapDrag,
  type DragPart,
  type ItemWindow,
} from './clip-edit-math';
import { gridSnapStep, gridSteps, LINE_BAR, LINE_GROUP, lineKind } from './grid-math';
import { LaneOverlay } from './lane-overlay';
import { autoScrollSpeed, laneSlotDuringDrag, laneTopDuringDrag } from './reorder-math';
import {
  clamp,
  clampScroll,
  clampZoom,
  CONTROLS_WIDTH,
  contentDuration,
  defaultZoom,
  followScroll,
  formatRulerTime,
  LANE_HEIGHT,
  laneScrollMax,
  maxScroll,
  MIXER_WIDTH,
  NEW_TRACK_ROW_HEIGHT,
  pointToTime,
  rulerSteps,
  waveformGain,
  waveformLevel,
  zoomAroundPoint,
} from './timeline-math';
import { TrackColumn, type FaderDraft } from './track-column';
import { LIFT_FADE, LIFT_SCALE, useTrackDrag } from './use-reorder-style';
import { useTakePeaks } from './use-take-peaks';
import { waveformPaths } from './waveform-path';
import { LEVEL_COUNT, LEVEL_FACTOR, maxAmplitude, peaksPerSecond } from './waveform-peaks';

/** Height of the ruler strip: tall enough to grab with a finger and drag the playhead. */
const RULER_SIZE = 32;
/** Touches this far below the ruler still scrub (it's a thin target). */
const RULER_SLOP = 12;
/** Space before 0:00: none, 0:00 sits at the track column edge (the playhead there is half hidden by it, which shows it is at the start). */
const LEADING_SPACE = 0;
const CLIP_INSET = 3;
const CLIP_RADIUS = 6;
const PLAYHEAD_WIDTH = 2;
const PLAYHEAD_HANDLE = 7;
/** Half-width of the punch point's notch on the ruler during a run-up. */
const PUNCH_NOTCH = 5;
/** Offset and blur of the shadow under a lane being dragged (at full lift). */
const LIFT_SHADOW_Y = 4;
const LIFT_SHADOW_BLUR = 8;
/** Touches this close to a selected clip's edge (points, either side) grab its trim handle. */
const HANDLE_REACH = 18;
/** The trim handles drawn inside a selected clip's edges. */
const HANDLE_WIDTH = 4;
const HANDLE_INSET = 4;
const SELECTED_BORDER = 2;
/** A dragged clip edge snaps to another clip's edge or the playhead within this many points. */
const SNAP_POINTS = 10;
/** A tap that moves further than this (points) is a drag, not a tap. */
const TAP_SLOP = 10;
/** Hold this long on a clip that isn't selected to pick it up. */
const LONG_PRESS_MS = 250;
/** The press highlight starts at this fraction, then fills over the hold. */
const PRESS_START = 0.35;
const PRESS_FADE_MS = 150;
const LIFT_MS = 150;
/** How much a picked-up clip grows. */
const CLIP_LIFT_SCALE = 0.04;
/** Dragging a clip this close to an edge of the view scrolls it (points, points per second). */
const AUTO_SCROLL_EDGE = 40;
const AUTO_SCROLL_SPEED = 600;
/** Opacity of the beat lines at full strength (they fade out when zoomed far out). */
const GRID_BEAT_ALPHA = 0.22;
/** Skia resolves fonts through the system font manager, which doesn't know RN's 'System' alias. */
const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

/** The take being recorded, drawn live on its track's lane. */
export type LiveTake = {
  /** Timeline position where the take starts (the punch point); before it the run-up plays. */
  start: number;
  trackId: string;
  /** Timeline position of the first of `peaks` (earlier than `start` after a run-up). */
  peaksStart: number;
  /** Interleaved `[min, max]` pairs at `peaksPerSecond`, appended as audio arrives. */
  peaks: SharedValue<number[]>;
  /** Loudest absolute sample so far (0…1), so all waveforms share one scale while recording. */
  peak: SharedValue<number>;
  peaksPerSecond: number;
};

type ClipShape = {
  id: string;
  start: number;
  offset: number;
  duration: number;
  /** Length of the clip's take: how far a trim can reveal it. */
  takeDuration: number;
  /** Index of its track (lane). */
  row: number;
  /** Muted, or another track is soloed: drawn faded. */
  silent: boolean;
  /** One path per detail level, in clip-local seconds × amplitude (-1…1); null while loading. */
  waveform: SkPath[] | null;
  /** The same for the whole take (only for the selected clip, so a trim can reveal more of it). */
  takeWaveform: SkPath[] | null;
  peaksPerSecond: number;
};

/** What the timeline can do to clips (`null` turns clip editing off, e.g. while recording). */
export type ClipEditing = {
  /** A drag of a clip or one of its handles ended there (one undo step). Returns whether it changed. */
  onPlace: (clipId: string, placement: ClipPlacement, label: string) => boolean;
  /** Split at timeline position `at`. */
  onSplit: (clipId: string, at: number) => void;
  /** Copy it to right after itself; returns the copy's id (it gets selected). */
  onDuplicate: (clipId: string) => string | null;
  onDelete: (clipId: string) => void;
};

/**
 * The project timeline, drawn with Skia on the UI thread: time runs left to right, tracks are
 * rows. Ruler on top, lanes with clips and waveforms, the playhead on top.
 *
 * Lanes have a fixed height (`LANE_HEIGHT`) and scroll vertically when they don't fit. A pinned
 * column on the left (`TrackColumn`) follows that scroll but not time: grab handles (long-press and
 * drag to reorder; the lane, its clips and its name move along, see `TrackDrag`), expanded into a
 * mixer (mute, solo, volume) by the button in the corner above it. The canvas and its gestures cover
 * only the time area right of the column, so expanding it narrows the time area. Names, "+ New Track" and the
 * "N more" chevrons are RN views over the lanes (`LaneOverlay`).
 *
 * Gestures: pan scrolls (with momentum, both axes), pinch zooms around the fingers, dragging on the
 * ruler scrubs the playhead (released: seek). Clips (T5): a tap selects one (edge handles and the
 * floating `ClipActionBar`), a tap anywhere else moves the playhead there and deselects. Dragging the
 * selected clip moves it (in time and between tracks), dragging near its edges trims it; holding an
 * unselected clip picks it up to move it in one go. Dragged edges snap to other clips' edges, 0:00 and
 * the playhead, and the view scrolls when the finger nears an edge. The drop is one `onPlace` call
 * (one undo step); until the saved project renders, the clip is drawn from the drag state, so it
 * doesn't flicker back. The pan decides on touch-down what it does (scrub, move, trim or scroll); the
 * long-press pan runs alongside it, and whichever takes the clip first owns it (`owner`).
 * Waveforms share one vertical scale per project (the loudest take fills its lane), so relative
 * loudness between takes stays true.
 */
export function Timeline({
  project,
  playhead,
  revealPlayhead,
  following,
  liveTake,
  armedTrackId,
  addTrackDisabled,
  clipEditing,
  onSeek,
  onArm,
  onEditTrack,
  onMoveTrack,
  onAddTrack,
  onToggleMute,
  onToggleSolo,
  onVolumeLive,
  onVolumeCommit,
}: {
  project: Project;
  /** Playhead position in seconds, animated by the transport. */
  playhead: SharedValue<number>;
  /** Bumped to bring the playhead into view (and resume following) even if it didn't move. */
  revealPlayhead: SharedValue<number>;
  /** Playing or recording: keep the playhead in view until the user scrolls. */
  following: boolean;
  /** The take being recorded, or null. */
  liveTake: LiveTake | null;
  armedTrackId: string | null;
  addTrackDisabled: boolean;
  clipEditing: ClipEditing | null;
  onSeek: (time: number) => void;
  onArm: (trackId: string) => void;
  onEditTrack: (trackId: string) => void;
  /** A track was dragged to index `toIndex`. */
  onMoveTrack: (trackId: string, toIndex: number) => void;
  onAddTrack: () => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  /** A volume slider moved (per move, for the engine); `onVolumeCommit` once when it's released. */
  onVolumeLive: (trackId: string, gain: number) => void;
  onVolumeCommit: (trackId: string, gain: number) => void;
}) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<FaderDraft | null>(null);
  const [mixerOpen, setMixerOpen] = useState(false);
  // Never wider than half the view (so some timeline stays visible next to the mixer).
  const columnWidth = mixerOpen
    ? Math.max(CONTROLS_WIDTH, Math.min(MIXER_WIDTH, size.width / 2 + CONTROLS_WIDTH))
    : CONTROLS_WIDTH;
  // The canvas covers the time area right of the controls column; its x = 0 is the column's edge.
  const viewWidth = Math.max(0, size.width - columnWidth);
  // Time is laid out over the view minus the leading space: x = LEADING_SPACE + (t - scroll) * zoom.
  const timeWidth = Math.max(0, viewWidth - LEADING_SPACE);
  const viewHeight = size.height;
  const trackCount = project.tracks.length;
  const lane = LANE_HEIGHT;
  const lanesViewport = Math.max(0, viewHeight - RULER_SIZE);
  const maxLaneScroll = laneScrollMax(lanesViewport, trackCount, lane, NEW_TRACK_ROW_HEIGHT);
  const duration = project.duration;
  const isRecording = liveTake != null;
  // The bar/beat grid (T9): lines in the lanes, bar numbers on the ruler, and a snap target for drags.
  const grid = project.grid;
  const meter = { bpm: project.bpm, beatsPerBar: project.beatsPerBar, beatUnit: project.beatUnit };

  const editable = clipEditing != null && !isRecording;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const peaks = useTakePeaks(Object.values(project.takes).map((take) => take.path));
  const anySolo = project.tracks.some((track) => track.solo);
  const clips: ClipShape[] = project.tracks.flatMap((track, row) =>
    track.clips.map((clip) => {
      const take = project.takes[clip.takeId];
      const levels = take ? peaks[take.path] : undefined;
      return {
        id: clip.id,
        start: clip.start,
        offset: clip.offset,
        duration: clip.duration,
        takeDuration: take?.duration ?? clip.offset + clip.duration,
        row,
        silent: anySolo ? !track.solo : track.muted,
        waveform: levels ? waveformPaths(levels, clip.offset, clip.duration) : null,
        takeWaveform:
          levels && take && clip.id === selectedId ? waveformPaths(levels, 0, take.duration) : null,
        peaksPerSecond: levels?.[0] ? peaksPerSecond(levels[0]) : 0,
      };
    }),
  );
  // The selection, if that clip still exists (undo can remove it) and clips can be edited now.
  const selectedIndex = editable ? clips.findIndex((clip) => clip.id === selectedId) : -1;
  const selected = clips[selectedIndex] ?? null;
  const selectedClipId = selected?.id ?? null;
  // The picture reads the selection from a shared value: a change of it redraws at once, while a
  // change that only reaches the picture through its closure waited for the next animated frame.
  const selection = useSharedValue<string | null>(null);
  useEffect(() => {
    selection.set(selectedClipId);
  }, [selection, selectedClipId]);
  // Loudest sample over the project's takes (the coarsest level keeps every take's extremes).
  const projectPeak = Object.values(peaks).reduce(
    (loudest, levels) => Math.max(loudest, maxAmplitude(levels[levels.length - 1] ?? levels[0])),
    0,
  );
  const trackIds = project.tracks.map((track) => track.id);
  const drag = useTrackDrag(trackIds);
  const liveLane = liveTake
    ? project.tracks.findIndex((track) => track.id === liveTake.trackId)
    : -1;
  // Split needs the playhead inside the selected clip; follows the playhead without re-rendering per frame.
  const [canSplit, setCanSplit] = useState(false);
  const selectedStart = selected?.start ?? 0;
  const selectedDuration = selected?.duration ?? 0;
  const hasSelection = selected != null;
  useAnimatedReaction(
    () =>
      hasSelection &&
      canSplitAt({ start: selectedStart, duration: selectedDuration }, playhead.get()),
    (now, before) => {
      if (now !== before) scheduleOnRN(setCanSplit, now);
    },
  );

  const paints = makePaints(theme.colors);
  const font = matchFont({ fontFamily: FONT_FAMILY, fontSize: theme.typography.caption.fontSize });

  const zoom = useSharedValue(0);
  const scroll = useSharedValue(0);
  const laneScroll = useSharedValue(0);
  const follow = useSharedValue(true);
  const pinchStartZoom = useSharedValue(0);
  /** Pan started on the ruler: it moves the playhead instead of scrolling. */
  const scrubbing = useSharedValue(false);
  /** Where the playhead is being dragged to, or -1. */
  const scrubTime = useSharedValue(-1);

  // Fit the zoom and scroll to the view: on first layout, rotation and when the idea grows. Runs on
  // the UI thread: scroll is moved there (gestures, following), so a JS-side read could be stale and
  // write an old position back (seen right after recording: the view jumped away from the playhead).
  useEffect(() => {
    if (timeWidth <= 0) return;
    scheduleOnUI(() => {
      'worklet';
      const extent = Math.max(duration, playhead.get());
      const nextZoom =
        zoom.get() > 0 ? clampZoom(zoom.get(), timeWidth, extent) : defaultZoom(timeWidth, extent);
      zoom.set(nextZoom);
      scroll.set(clampScroll(scroll.get(), timeWidth, nextZoom, extent));
      laneScroll.set(clamp(laneScroll.get(), 0, maxLaneScroll));
    });
  }, [timeWidth, duration, maxLaneScroll, zoom, scroll, laneScroll, playhead]);

  useEffect(() => {
    if (following) follow.set(true);
  }, [following, follow]);

  // Keep the playhead in view: follow it while playing/recording (until the user scrolls), and
  // bring it back into view when it jumps elsewhere (stop, end of playback, seek).
  useAnimatedReaction(
    () => playhead.get(),
    (position, previous) => {
      const currentZoom = zoom.get();
      if (currentZoom <= 0) return;
      const viewSeconds = timeWidth / currentZoom;
      if (following) {
        if (follow.get()) scroll.set(followScroll(scroll.get(), position, viewSeconds));
        return;
      }
      const start = scroll.get();
      if (position === previous || (position >= start && position <= start + viewSeconds)) return;
      scroll.set(
        clampScroll(
          followScroll(start, position, viewSeconds),
          timeWidth,
          currentZoom,
          Math.max(duration, position),
        ),
      );
    },
  );

  // Back to start: show the playhead even if it was already there or the user had scrolled away.
  useAnimatedReaction(
    () => revealPlayhead.get(),
    (request, previous) => {
      const currentZoom = zoom.get();
      if (previous === null || request === previous || currentZoom <= 0) return;
      follow.set(true);
      const position = playhead.get();
      scroll.set(
        clampScroll(
          followScroll(scroll.get(), position, timeWidth / currentZoom),
          timeWidth,
          currentZoom,
          Math.max(duration, position),
        ),
      );
    },
  );

  const seekable = (x: number) => {
    'worklet';
    return clamp(
      pointToTime(x - LEADING_SPACE, scroll.get(), zoom.get()),
      0,
      contentDuration(duration),
    );
  };

  // Clip drag state (UI thread). Which gesture holds a clip: 0 none, 1 the pan (dragging the selected
  // clip or its handles), 2 the long-press pickup.
  const owner = useSharedValue(0);
  /** The finger has started moving the clip (auto-scroll runs). */
  const dragging = useSharedValue(false);
  /** The pan is scrolling the view (a long press can't pick a clip up any more). */
  const panScrolling = useSharedValue(false);
  /** The clip being dragged (also drawn from these until the dropped edit renders), or null. */
  const dragId = useSharedValue<string | null>(null);
  const dragIndex = useSharedValue(-1);
  const dragPart = useSharedValue<number>(DRAG_NONE);
  const dragWin = useSharedValue<ItemWindow>({ start: 0, offset: 0, duration: 0 });
  const dragRow = useSharedValue(0);
  /** Bumped by every drag, so clearing an old drop can't clear a newer drag. */
  const dragSerial = useSharedValue(0);
  /** Timeline time under the finger when the drag started, and the finger now. */
  const grabTime = useSharedValue(0);
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  /** 0 → 1 while a moved clip is lifted (shadow, scale). */
  const lift = useSharedValue(0);
  /** Time a dragged edge snapped to (drawn as a guide), or -1. */
  const snapTime = useSharedValue(-1);
  /** The clip held before pickup (index), its id and how far along the hold is (0…1). */
  const pickIndex = useSharedValue(-1);
  const pressId = useSharedValue<string | null>(null);
  const press = useSharedValue(0);
  /** The drag whose drop is waiting for its saved edit to render. */
  const awaitingSerial = useRef(-1);

  const timeAt = (x: number) => {
    'worklet';
    return pointToTime(x - LEADING_SPACE, scroll.get(), zoom.get());
  };

  /** Index of the clip under a point, or -1. */
  const clipAt = (x: number, y: number) => {
    'worklet';
    const contentY = y - RULER_SIZE + laneScroll.get();
    if (contentY < 0 || contentY >= trackCount * lane) return -1;
    return itemAt(clips, timeAt(x), Math.floor(contentY / lane));
  };

  const startDrag = (index: number, part: DragPart, x: number, y: number) => {
    'worklet';
    const clip = clips[index];
    if (!clip) return;
    dragSerial.set(dragSerial.get() + 1);
    dragIndex.set(index);
    dragId.set(clip.id);
    dragPart.set(part);
    dragWin.set({ start: clip.start, offset: clip.offset, duration: clip.duration });
    dragRow.set(clip.row);
    grabTime.set(timeAt(x));
    fingerX.set(x);
    fingerY.set(y);
    snapTime.set(-1);
  };

  // The dragged clip's window and lane for where the finger (and the view) is now.
  const updateDrag = () => {
    'worklet';
    const clip = clips[dragIndex.get()];
    const z = zoom.get();
    if (!clip || z <= 0) return;
    const part = dragPart.get() as DragPart;
    const origin = { start: clip.start, offset: clip.offset, duration: clip.duration };
    const candidates = [0, playhead.get()];
    for (const other of clips) {
      if (other.id !== clip.id) candidates.push(other.start, other.start + other.duration);
    }
    const snapped = snapDrag(
      part,
      origin,
      timeAt(fingerX.get()) - grabTime.get(),
      candidates,
      SNAP_POINTS / z,
      grid ? gridSnapStep(meter, z) : 0,
    );
    const next = dragWindow(part, origin, snapped.delta, clip.takeDuration, MIN_CLIP_SECONDS);
    // A limit (0:00, the take's bounds) can stop the edge short of the snap point: no guide then.
    const snap = snapped.snapTime;
    const landed =
      snap >= 0 &&
      (Math.abs(next.start - snap) < 1e-6 || Math.abs(next.start + next.duration - snap) < 1e-6);
    dragWin.set(next);
    snapTime.set(landed ? snap : -1);
    if (part === DRAG_MOVE) {
      dragRow.set(rowAt(fingerY.get() - RULER_SIZE, laneScroll.get(), lane, trackCount));
    }
  };

  // Scrolls the view while a dragged clip is near an edge, so it can go anywhere.
  const autoScroll = useFrameCallback((frame) => {
    'worklet';
    const z = zoom.get();
    if (!dragging.get() || z <= 0) return;
    const sx = autoScrollSpeed(fingerX.get(), viewWidth, AUTO_SCROLL_EDGE, AUTO_SCROLL_SPEED);
    const sy =
      dragPart.get() === DRAG_MOVE
        ? autoScrollSpeed(
            fingerY.get() - RULER_SIZE,
            lanesViewport,
            AUTO_SCROLL_EDGE,
            AUTO_SCROLL_SPEED,
          )
        : 0;
    if (sx === 0 && sy === 0) return;
    const seconds = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const window = dragWin.get();
    const extent = Math.max(duration, playhead.get(), window.start + window.duration);
    scroll.set(clampScroll(scroll.get() + (sx * seconds) / z, timeWidth, z, extent));
    laneScroll.set(clamp(laneScroll.get() + sy * seconds, 0, maxLaneScroll));
    updateDrag();
  }, false);

  const clearDrag = () => {
    dragId.set(null);
    dragIndex.set(-1);
  };
  const startAutoScroll = () => autoScroll.setActive(true);
  const stopAutoScroll = () => autoScroll.setActive(false);
  const pickedUp = (clipId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedId(clipId);
    autoScroll.setActive(true);
  };
  const commitDrag = (serial: number, clipId: string, placement: ClipPlacement, label: string) => {
    if (clipEditing?.onPlace(clipId, placement, label)) {
      awaitingSerial.current = serial;
    } else if (dragSerial.get() === serial) {
      clearDrag();
    }
  };
  // The drop rendered: draw the clip from the project again.
  useEffect(() => {
    const serial = awaitingSerial.current;
    if (serial < 0) return;
    awaitingSerial.current = -1;
    if (dragSerial.get() === serial && owner.get() === 0) {
      dragId.set(null);
      dragIndex.set(-1);
    }
  }, [project, dragSerial, owner, dragId, dragIndex]);

  const finishDrag = () => {
    'worklet';
    const clip = clips[dragIndex.get()];
    const part = dragPart.get();
    owner.set(0);
    dragging.set(false);
    snapTime.set(-1);
    lift.set(withTiming(0, { duration: LIFT_MS }));
    scheduleOnRN(stopAutoScroll);
    const window = dragWin.get();
    const row = dragRow.get();
    const trackId = trackIds[row];
    const unchanged =
      clip != null &&
      row === clip.row &&
      window.start === clip.start &&
      window.offset === clip.offset &&
      window.duration === clip.duration;
    if (!clip || trackId == null || unchanged) {
      dragId.set(null);
      dragIndex.set(-1);
      return;
    }
    scheduleOnRN(
      commitDrag,
      dragSerial.get(),
      clip.id,
      { trackId, start: window.start, offset: window.offset, duration: window.duration },
      part === DRAG_MOVE ? 'Move clip' : 'Trim clip',
    );
  };

  // A snapped edge clicks, so snapping can be felt as well as seen.
  const snapped = () => void Haptics.selectionAsync();
  useAnimatedReaction(
    () => snapTime.get(),
    (now, before) => {
      if (now >= 0 && before != null && now !== before) scheduleOnRN(snapped);
    },
  );

  const pan = usePanGesture({
    onBegin: (event) => {
      'worklet';
      cancelAnimation(scroll);
      const onRuler = event.y <= RULER_SIZE + RULER_SLOP;
      scrubbing.set(!isRecording && onRuler);
      panScrolling.set(false);
      // On the selected clip: this pan drags it (an edge trims, the body moves).
      const clip = clips[selectedIndex];
      if (onRuler || !clip || owner.get() !== 0) return;
      const contentY = event.y - RULER_SIZE + laneScroll.get();
      if (Math.floor(contentY / lane) !== clip.row) return;
      const part = grabPart(clip, timeAt(event.x), HANDLE_REACH / zoom.get());
      if (part === DRAG_NONE) return;
      owner.set(1);
      startDrag(selectedIndex, part, event.x, event.y);
    },
    onActivate: () => {
      'worklet';
      if (owner.get() === 1) {
        dragging.set(true);
        follow.set(false);
        if (dragPart.get() === DRAG_MOVE) lift.set(withTiming(1, { duration: LIFT_MS }));
        scheduleOnRN(startAutoScroll);
      } else if (owner.get() === 0 && !scrubbing.get()) {
        panScrolling.set(true);
        press.set(0);
      }
    },
    onUpdate: (event) => {
      'worklet';
      if (scrubbing.get()) {
        const time = seekable(event.x);
        scrubTime.set(time);
        // Idle: the playhead (and clock) follow the finger. Playing: seek once, on release.
        if (!following) scheduleOnRN(onSeek, time);
        return;
      }
      if (owner.get() !== 0) {
        if (owner.get() === 1) {
          fingerX.set(event.x);
          fingerY.set(event.y);
          updateDrag();
        }
        return;
      }
      follow.set(false);
      const currentZoom = zoom.get();
      const extent = Math.max(duration, playhead.get());
      scroll.set(
        clampScroll(scroll.get() - event.changeX / currentZoom, timeWidth, currentZoom, extent),
      );
      laneScroll.set(clamp(laneScroll.get() - event.changeY, 0, maxLaneScroll));
    },
    onDeactivate: (event) => {
      'worklet';
      if (scrubbing.get()) {
        const time = scrubTime.get();
        if (time >= 0) scheduleOnRN(onSeek, time);
        return;
      }
      if (owner.get() !== 0 || !panScrolling.get()) return;
      const currentZoom = zoom.get();
      const extent = Math.max(duration, playhead.get());
      scroll.set(
        withDecay({
          velocity: -event.velocityX / currentZoom,
          clamp: [0, maxScroll(timeWidth, currentZoom, extent)],
        }),
      );
    },
    onFinalize: () => {
      'worklet';
      scrubbing.set(false);
      scrubTime.set(-1);
      if (owner.get() === 1) finishDrag();
    },
  });

  // Holding a clip that isn't selected picks it up: it lights up at once and fills in over the hold
  // (as track reorder does), then lifts with a haptic and follows the finger.
  const pickup = usePanGesture({
    enabled: editable,
    activateAfterLongPress: LONG_PRESS_MS,
    onBegin: (event) => {
      'worklet';
      pickIndex.set(-1);
      if (event.y <= RULER_SIZE + RULER_SLOP) return;
      const index = clipAt(event.x, event.y);
      const clip = clips[index];
      if (!clip || clip.id === selectedClipId) return;
      pickIndex.set(index);
      pressId.set(clip.id);
      press.set(PRESS_START);
      press.set(withTiming(1, { duration: LONG_PRESS_MS }));
    },
    onActivate: (event) => {
      'worklet';
      const index = pickIndex.get();
      const clip = clips[index];
      if (!clip || owner.get() !== 0 || panScrolling.get()) return;
      owner.set(2);
      startDrag(index, DRAG_MOVE, event.x, event.y);
      dragging.set(true);
      follow.set(false);
      press.set(withTiming(0, { duration: LIFT_MS }));
      lift.set(withTiming(1, { duration: LIFT_MS }));
      scheduleOnRN(pickedUp, clip.id);
    },
    onUpdate: (event) => {
      'worklet';
      if (owner.get() !== 2) return;
      fingerX.set(event.x);
      fingerY.set(event.y);
      updateDrag();
    },
    onFinalize: () => {
      'worklet';
      press.set(withTiming(0, { duration: PRESS_FADE_MS }));
      if (owner.get() === 2) finishDrag();
    },
  });

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      pinchStartZoom.set(zoom.get());
    },
    onUpdate: (event) => {
      'worklet';
      const extent = Math.max(duration, playhead.get());
      const nextZoom = clampZoom(pinchStartZoom.get() * event.scale, timeWidth, extent);
      const focal = event.focalX - LEADING_SPACE;
      const nextScroll = zoomAroundPoint(scroll.get(), zoom.get(), nextZoom, focal);
      zoom.set(nextZoom);
      scroll.set(clampScroll(nextScroll, timeWidth, nextZoom, extent));
    },
  });

  // A tap on a clip selects it (never seeks); anywhere else moves the playhead and deselects.
  const tap = useTapGesture({
    // Without a limit a quick swipe also counts as a tap (seeking or selecting where it started).
    maxDistance: TAP_SLOP,
    onActivate: (event) => {
      'worklet';
      press.set(withTiming(0, { duration: PRESS_FADE_MS }));
      const clip = editable && event.y > RULER_SIZE ? clips[clipAt(event.x, event.y)] : undefined;
      if (clip) {
        scheduleOnRN(setSelectedId, clip.id);
        return;
      }
      scheduleOnRN(onSeek, seekable(event.x));
      scheduleOnRN(setSelectedId, null);
    },
  });

  const gesture = useSimultaneousGestures(pan, pickup, pinch, tap);

  const picture = useDerivedValue(() =>
    createPicture((canvas) => {
      const z = zoom.get();
      if (z <= 0) return;
      const s = scroll.get();
      const ls = laneScroll.get();
      const scrubbed = scrubTime.get();
      const position = scrubbed >= 0 ? scrubbed : playhead.get();
      const gain = waveformGain(Math.max(projectPeak, liveTake ? liveTake.peak.get() : 0));
      // A track being dragged: it follows the finger, the lanes it passes slide aside.
      const liftedId = drag.id.get();
      const lifted = liftedId == null ? -1 : trackIds.indexOf(liftedId);
      const dragTop = drag.top.get();
      const progress = drag.progress.get();
      const target = drag.target.get();
      // Each lane takes the stripe of the slot it's heading to, so the rows keep alternating.
      const stripe = (index: number) =>
        laneSlotDuringDrag(index, lifted, target) % 2 === 1 ? paints.laneAlt : paints.lane;
      const laneTop = (index: number) =>
        RULER_SIZE + laneTopDuringDrag(index, lane, lifted, dragTop, progress) - ls;
      const selectedNow = selection.get();
      const dragged = dragId.get();
      const draggedWindow = dragWin.get();
      const draggedRow = dragRow.get();
      const lifting = lift.get();
      const pressAmount = press.get();
      const pressed = pressAmount > 0 ? pressId.get() : null;
      const visibleStart = s - LEADING_SPACE / z;
      const visibleEnd = s + timeWidth / z;
      const toX = (time: number) => LEADING_SPACE + (time - s) * z;

      // The grid's vertical lines for one lane (drawn translated to each lane's top): beats while
      // they're far enough apart, else every bar or every few bars. Bars are the strongest lines;
      // compound meters (6/8, 12/8) add a medium line at each group of three.
      const gridLevels = grid ? gridSteps(meter, z) : null;
      const gridPaths = (() => {
        if (!gridLevels) return null;
        const barLength = barSeconds(meter);
        const bars = Skia.PathBuilder.Make();
        const groups = Skia.PathBuilder.Make();
        const beats = Skia.PathBuilder.Make();
        const line = (builder: typeof bars, time: number) => {
          const gx = toX(time);
          if (gx < 0.5 || gx > viewWidth) return;
          builder.moveTo(gx, 0);
          builder.lineTo(gx, lane);
        };
        if (gridLevels.beatAlpha > 0) {
          const beatLength = beatSeconds(meter);
          const compound = isCompound(meter.beatsPerBar, meter.beatUnit);
          const last = Math.ceil(visibleEnd / beatLength);
          for (
            let beat = Math.max(0, Math.floor(visibleStart / beatLength));
            beat <= last;
            beat++
          ) {
            const kind = lineKind(beat, meter.beatsPerBar, compound);
            line(
              kind === LINE_BAR ? bars : kind === LINE_GROUP ? groups : beats,
              beat * beatLength,
            );
          }
        } else {
          const every = gridLevels.lineEvery;
          const first = Math.max(0, Math.floor(visibleStart / barLength / every) * every);
          for (let bar = first; bar * barLength <= visibleEnd; bar += every) {
            line(bars, bar * barLength);
          }
        }
        paints.gridBeat.setAlphaf(GRID_BEAT_ALPHA * gridLevels.beatAlpha);
        return { bars: bars.detach(), groups: groups.detach(), beats: beats.detach() };
      })();

      const drawLane = (index: number) => {
        const top = laneTop(index);
        canvas.drawRect(
          Skia.XYWHRect(0, top, viewWidth, lane),
          index === lifted ? paints.laneLifted : stripe(index),
        );
        if (gridPaths) {
          canvas.save();
          canvas.translate(0, top);
          canvas.drawPath(gridPaths.beats, paints.gridBeat);
          canvas.drawPath(gridPaths.groups, paints.gridGroup);
          canvas.drawPath(gridPaths.bars, paints.gridBar);
          canvas.restore();
        }
        canvas.drawLine(0, top + lane, viewWidth, top + lane, paints.separator);
      };
      // A clip showing `offset…offset + length` of its take from `start` on lane `row` (a drag can
      // differ from the clip's saved window and lane).
      const drawClip = (
        clip: ClipShape,
        start: number,
        offset: number,
        length: number,
        row: number,
      ) => {
        const x0 = toX(start);
        const width = length * z;
        if (x0 > viewWidth || x0 + width < 0) return;
        const top = laneTop(row) + CLIP_INSET;
        const height = lane - CLIP_INSET * 2;
        const rect = Skia.XYWHRect(x0, top, width, height);
        const rrect = Skia.RRectXY(rect, CLIP_RADIUS, CLIP_RADIUS);
        const isSelected = clip.id === selectedNow;
        if (clip.silent) canvas.saveLayer(paints.silent);
        canvas.drawRRect(rrect, isSelected ? paints.clipSelected : paints.clip);
        canvas.drawRRect(rrect, isSelected ? paints.selectedBorder : paints.clipBorder);
        canvas.drawLine(x0, top + height / 2, x0 + width, top + height / 2, paints.centerLine);
        // Trimmed past its saved window (while dragging a handle): draw from the whole take's path.
        const whole =
          clip.takeWaveform != null && (offset !== clip.offset || length !== clip.duration);
        const paths = whole ? clip.takeWaveform : clip.waveform;
        const path = paths
          ? paths[waveformLevel(clip.peaksPerSecond, z, LEVEL_COUNT, LEVEL_FACTOR)]
          : undefined;
        if (path) {
          canvas.save();
          canvas.clipRect(rect, ClipOp.Intersect, true);
          // x of the path's 0: the take's start, or the saved window's start.
          canvas.translate(x0 - (offset - (whole ? 0 : clip.offset)) * z, top + height / 2);
          canvas.scale(z, (height / 2 - CLIP_INSET) * gain);
          canvas.drawPath(path, paints.waveform);
          canvas.restore();
        }
        if (clip.id === pressed) {
          paints.press.setAlphaf(0.3 * pressAmount);
          canvas.drawRRect(rrect, paints.press);
        }
        if (isSelected) {
          const handleTop = top + height * 0.3;
          const handleHeight = height * 0.4;
          for (const hx of [x0 + HANDLE_INSET, x0 + width - HANDLE_INSET - HANDLE_WIDTH]) {
            const handle = Skia.XYWHRect(hx, handleTop, HANDLE_WIDTH, handleHeight);
            canvas.drawRRect(
              Skia.RRectXY(handle, HANDLE_WIDTH / 2, HANDLE_WIDTH / 2),
              paints.handle,
            );
          }
        }
        if (clip.silent) canvas.restore();
      };
      const drawSaved = (clip: ClipShape) =>
        drawClip(clip, clip.start, clip.offset, clip.duration, clip.row);

      // Lanes, then clips and their waveforms (the lifted lane comes last, on top).
      for (let index = 0; index < trackCount; index++) if (index !== lifted) drawLane(index);
      for (const clip of clips) if (clip.row !== lifted && clip.id !== dragged) drawSaved(clip);

      // The lifted lane: a bit larger, see-through, with a shadow under it.
      if (lifted >= 0) {
        const lift = drag.lift.get();
        const top = laneTop(lifted);
        const scale = 1 + LIFT_SCALE * lift;
        canvas.save();
        canvas.translate(viewWidth / 2, top + lane / 2);
        canvas.scale(scale, scale);
        canvas.translate(-viewWidth / 2, -(top + lane / 2));
        if (lift > 0) {
          paints.liftShadow.setAlphaf(0.35 * lift);
          canvas.drawRect(
            Skia.XYWHRect(0, top + LIFT_SHADOW_Y * lift, viewWidth, lane),
            paints.liftShadow,
          );
        }
        paints.liftLayer.setAlphaf(1 - LIFT_FADE * lift);
        canvas.saveLayer(paints.liftLayer);
        drawLane(lifted);
        canvas.drawLine(0, top, viewWidth, top, paints.separator);
        for (const clip of clips) if (clip.row === lifted && clip.id !== dragged) drawSaved(clip);
        canvas.restore();
        canvas.restore();
      }

      // The clip being dragged, on top of what it will replace (lifted while it's being moved).
      const draggedClip = dragged == null ? undefined : clips.find((clip) => clip.id === dragged);
      if (draggedClip) {
        const x0 = toX(draggedWindow.start);
        const width = draggedWindow.duration * z;
        const top = laneTop(draggedRow) + CLIP_INSET;
        const height = lane - CLIP_INSET * 2;
        const scale = 1 + CLIP_LIFT_SCALE * lifting;
        canvas.save();
        canvas.translate(x0 + width / 2, top + height / 2);
        canvas.scale(scale, scale);
        canvas.translate(-(x0 + width / 2), -(top + height / 2));
        if (lifting > 0) {
          paints.liftShadow.setAlphaf(0.35 * lifting);
          const shadow = Skia.XYWHRect(x0, top + LIFT_SHADOW_Y * lifting, width, height);
          canvas.drawRRect(Skia.RRectXY(shadow, CLIP_RADIUS, CLIP_RADIUS), paints.liftShadow);
        }
        drawClip(
          draggedClip,
          draggedWindow.start,
          draggedWindow.offset,
          draggedWindow.duration,
          draggedRow,
        );
        canvas.restore();
      }

      // The take being recorded, on its track's lane, with the waveform received so far.
      if (liveTake && liveLane >= 0 && position > liveTake.start) {
        const x0 = toX(liveTake.start);
        const top = laneTop(liveLane) + CLIP_INSET;
        const height = lane - CLIP_INSET * 2;
        const rect = Skia.XYWHRect(x0, top, (position - liveTake.start) * z, height);
        // It replaces what's under it on the track, so cover that up first.
        const rrect = Skia.RRectXY(rect, CLIP_RADIUS, CLIP_RADIUS);
        canvas.drawRRect(rrect, stripe(liveLane));
        canvas.drawRRect(rrect, paints.recording);
        drawLivePeaks(canvas, {
          data: liveTake.peaks.get(),
          perSecond: liveTake.peaksPerSecond,
          start: liveTake.peaksStart,
          from: Math.max(liveTake.start, visibleStart),
          to: Math.min(visibleEnd, position),
          originX: x0,
          zoom: z,
          middle: top + height / 2,
          amplitude: (height / 2 - CLIP_INSET) * gain,
          limit: height / 2 - CLIP_INSET,
          paint: paints.liveWaveform,
        });
      }

      // Ruler: ticks along the bottom edge, labels above them. With the grid on it counts bars
      // (1, 2, 3…) instead of minutes and seconds.
      canvas.drawRect(Skia.XYWHRect(0, 0, viewWidth, RULER_SIZE), paints.ruler);
      const labelY = RULER_SIZE - 13;
      if (gridLevels) {
        const barLength = barSeconds(meter);
        const { lineEvery, labelEvery } = gridLevels;
        const lastBar = Math.ceil(visibleEnd / barLength);
        for (
          let bar = Math.max(0, Math.floor(visibleStart / barLength / lineEvery) * lineEvery);
          bar <= lastBar;
          bar += lineEvery
        ) {
          const x = toX(bar * barLength);
          if (x < 1) continue;
          canvas.drawLine(
            x,
            RULER_SIZE - (bar % labelEvery === 0 ? 10 : 5),
            x,
            RULER_SIZE,
            paints.tick,
          );
        }
        if (gridLevels.beatAlpha > 0) {
          const beatLength = beatSeconds(meter);
          paints.tickBeat.setAlphaf(gridLevels.beatAlpha);
          const lastBeat = Math.ceil(visibleEnd / beatLength);
          for (
            let beat = Math.max(0, Math.floor(visibleStart / beatLength));
            beat <= lastBeat;
            beat++
          ) {
            const x = toX(beat * beatLength);
            if (x < 1 || beat % meter.beatsPerBar === 0) continue;
            canvas.drawLine(x, RULER_SIZE - 4, x, RULER_SIZE, paints.tickBeat);
          }
        }
        canvas.drawLine(0, RULER_SIZE, viewWidth, RULER_SIZE, paints.separator);
        const firstLabel = Math.max(0, Math.floor(visibleStart / barLength / labelEvery));
        const lastLabel = Math.ceil(visibleEnd / barLength / labelEvery);
        for (let index = firstLabel; index <= lastLabel; index++) {
          const bar = index * labelEvery;
          canvas.drawText(String(bar + 1), toX(bar * barLength) + 4, labelY, paints.label, font);
        }
      } else {
        const steps = rulerSteps(z);
        const firstTick = Math.max(0, Math.floor(visibleStart / steps.tick));
        const lastTick = Math.ceil(visibleEnd / steps.tick);
        for (let index = firstTick; index <= lastTick; index++) {
          const time = index * steps.tick;
          const x = toX(time);
          // The tick at the column edge would thicken the toggle's right border.
          if (x < 1) continue;
          const isLabel = isMultiple(time, steps.label);
          canvas.drawLine(x, RULER_SIZE - (isLabel ? 10 : 5), x, RULER_SIZE, paints.tick);
        }
        canvas.drawLine(0, RULER_SIZE, viewWidth, RULER_SIZE, paints.separator);
        const firstLabel = Math.max(0, Math.floor(visibleStart / steps.label));
        const lastLabel = Math.ceil(visibleEnd / steps.label);
        for (let index = firstLabel; index <= lastLabel; index++) {
          const x = toX(index * steps.label);
          canvas.drawText(formatRulerTime(index * steps.label), x + 4, labelY, paints.label, font);
        }
      }

      const playheadEnd = Math.min(viewHeight, RULER_SIZE + trackCount * lane - ls);

      // The punch point during the run-up: a dashed line down the lanes, a notch on the ruler.
      if (liveTake && position < liveTake.start) {
        const px = toX(liveTake.start);
        canvas.drawLine(px, RULER_SIZE, px, Math.max(RULER_SIZE, playheadEnd), paints.punch);
        const notch = Skia.PathBuilder.Make();
        notch.moveTo(px - PUNCH_NOTCH, RULER_SIZE - PUNCH_NOTCH);
        notch.lineTo(px + PUNCH_NOTCH, RULER_SIZE - PUNCH_NOTCH);
        notch.lineTo(px, RULER_SIZE);
        notch.close();
        canvas.drawPath(notch.detach(), paints.playheadHandle);
      }

      // Where a dragged clip edge snapped: a guide line down the lanes.
      const snap = snapTime.get();
      if (dragged != null && snap >= 0) {
        const sx = toX(snap);
        canvas.drawLine(sx, RULER_SIZE, sx, Math.max(RULER_SIZE, playheadEnd), paints.snapLine);
      }

      // Playhead, on top of everything, with a handle on the ruler to show it can be dragged.
      const x = toX(position);
      canvas.drawLine(x, 0, x, Math.max(RULER_SIZE, playheadEnd), paints.playhead);
      const handle = Skia.PathBuilder.Make();
      handle.moveTo(x - PLAYHEAD_HANDLE, 0);
      handle.lineTo(x + PLAYHEAD_HANDLE, 0);
      handle.lineTo(x + PLAYHEAD_HANDLE, RULER_SIZE - PLAYHEAD_HANDLE * 2);
      handle.lineTo(x, RULER_SIZE - PLAYHEAD_HANDLE);
      handle.lineTo(x - PLAYHEAD_HANDLE, RULER_SIZE - PLAYHEAD_HANDLE * 2);
      handle.close();
      canvas.drawPath(handle.detach(), paints.playheadHandle);
    }),
  );

  const clipCount = clips.length;
  return (
    <View
      style={styles.root}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}>
      <GestureDetector gesture={gesture}>
        <View
          style={[styles.timeArea, { left: columnWidth }]}
          accessible
          accessibilityLabel={`Timeline, ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}, ${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`}>
          {size.width > 0 ? (
            <Canvas style={StyleSheet.absoluteFill}>
              <Picture picture={picture} />
            </Canvas>
          ) : null}
        </View>
      </GestureDetector>
      {size.width > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mixer"
            accessibilityHint="Shows mute, solo and volume for each track"
            accessibilityState={{ expanded: mixerOpen }}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => setMixerOpen((open) => !open)}
            style={({ pressed }) => [
              styles.corner,
              {
                width: columnWidth,
                backgroundColor: mixerOpen
                  ? theme.colors.surfacePressed
                  : theme.colors.surfaceMuted,
                borderBottomColor: theme.colors.border,
                borderRightColor: theme.colors.border,
              },
              pressed && styles.pressed,
            ]}>
            <View style={styles.cornerIcon}>
              <Icon
                name={{ ios: 'slider.horizontal.3', android: 'tune' }}
                size={18}
                color={mixerOpen ? 'text' : 'textSecondary'}
              />
            </View>
          </Pressable>
          <TrackColumn
            tracks={project.tracks}
            top={RULER_SIZE}
            width={columnWidth}
            armWidth={CONTROLS_WIDTH}
            expanded={mixerOpen}
            anySolo={anySolo}
            onToggleMute={onToggleMute}
            onToggleSolo={onToggleSolo}
            lane={lane}
            laneScroll={laneScroll}
            viewport={lanesViewport}
            maxLaneScroll={maxLaneScroll}
            drag={drag}
            editDisabled={isRecording}
            draft={draft}
            onEdit={onEditTrack}
            onMoveTrack={onMoveTrack}
            onVolumeDrag={(trackId, gain) => {
              setDraft({ trackId, gain });
              onVolumeLive(trackId, gain);
            }}
            onVolumeRelease={(trackId, gain) => {
              setDraft(null);
              onVolumeCommit(trackId, gain);
            }}
          />
          <LaneOverlay
            tracks={project.tracks}
            top={RULER_SIZE}
            left={columnWidth}
            viewport={lanesViewport}
            lane={lane}
            inset={CLIP_INSET}
            footer={NEW_TRACK_ROW_HEIGHT}
            laneScroll={laneScroll}
            drag={drag}
            draft={draft}
            armedTrackId={armedTrackId}
            armDisabled={isRecording}
            addTrackDisabled={addTrackDisabled}
            onArm={onArm}
            onAddTrack={onAddTrack}
          />
          {selected && clipEditing ? (
            <View pointerEvents="box-none" style={[styles.actionBar, { left: columnWidth }]}>
              <ClipActionBar
                canSplit={canSplit}
                onSplit={() => clipEditing.onSplit(selected.id, playhead.get())}
                onDuplicate={() => {
                  const copyId = clipEditing.onDuplicate(selected.id);
                  if (copyId) setSelectedId(copyId);
                }}
                onDelete={() => {
                  clipEditing.onDelete(selected.id);
                  setSelectedId(null);
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * The live waveform: one bar per peak (merged so there's at most about one per point), only for the
 * visible part. Peaks are `[min, max]` pairs; peak `i` covers `start + i / perSecond`.
 */
function drawLivePeaks(
  canvas: SkCanvas,
  live: {
    data: number[];
    perSecond: number;
    start: number;
    /** Visible time range to draw (seconds on the timeline). */
    from: number;
    to: number;
    /** x of the take's start. */
    originX: number;
    zoom: number;
    middle: number;
    /** Points per unit of amplitude (already scaled by the shared gain). */
    amplitude: number;
    /** Bars never reach further than this from the middle. */
    limit: number;
    paint: SkPaint;
  },
) {
  'worklet';
  const count = live.data.length / 2;
  const step = Math.max(1, Math.floor(live.perSecond / live.zoom));
  const first = Math.max(0, Math.floor(((live.from - live.start) * live.perSecond) / step) * step);
  const last = Math.min(count, Math.ceil((live.to - live.start) * live.perSecond));
  if (last <= first) return;
  const width = Math.max(1, (step / live.perSecond) * live.zoom);
  const builder = Skia.PathBuilder.Make();
  for (let peak = first; peak < last; peak += step) {
    let min = 0;
    let max = 0;
    const end = Math.min(peak + step, last);
    for (let i = peak; i < end; i++) {
      min = Math.min(min, live.data[i * 2] ?? 0);
      max = Math.max(max, live.data[i * 2 + 1] ?? 0);
    }
    const point = live.originX + (peak / live.perSecond) * live.zoom;
    const up = Math.min(live.limit, max * live.amplitude);
    const down = Math.min(live.limit, -min * live.amplitude);
    builder.addRect(Skia.XYWHRect(point, live.middle - up, width, Math.max(1, up + down)));
  }
  canvas.drawPath(builder.detach(), live.paint);
}

function isMultiple(value: number, step: number): boolean {
  'worklet';
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

function makePaints(colors: ThemeColors) {
  const fill = (color: string, alpha = 1) => {
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(color));
    paint.setAlphaf(alpha);
    paint.setAntiAlias(true);
    return paint;
  };
  const stroke = (color: string, width: number) => {
    const paint = fill(color);
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(width);
    return paint;
  };
  return {
    lane: fill(colors.background),
    laneAlt: fill(colors.laneAlt),
    laneLifted: fill(colors.laneLifted),
    separator: stroke(colors.border, StyleSheet.hairlineWidth),
    clip: fill(colors.clip),
    clipSelected: fill(colors.clipSelected),
    selectedBorder: stroke(colors.waveform, SELECTED_BORDER),
    handle: fill(colors.waveform),
    /** The fill over a clip being held before pickup (alpha set per frame). */
    press: fill(colors.waveform),
    snapLine: stroke(colors.snapLine, 1.5),
    clipBorder: (() => {
      const paint = stroke(colors.waveform, 1);
      paint.setAlphaf(0.45);
      return paint;
    })(),
    centerLine: stroke(colors.waveform, StyleSheet.hairlineWidth),
    waveform: fill(colors.waveform),
    recording: fill(colors.primary, 0.2),
    liveWaveform: fill(colors.primary, 0.8),
    ruler: fill(colors.surfaceMuted),
    tick: stroke(colors.textTertiary, 1),
    tickBeat: stroke(colors.textTertiary, 1),
    gridBar: (() => {
      const paint = stroke(colors.textTertiary, 1);
      paint.setAlphaf(0.5);
      return paint;
    })(),
    gridGroup: (() => {
      const paint = stroke(colors.textTertiary, StyleSheet.hairlineWidth);
      paint.setAlphaf(0.35);
      return paint;
    })(),
    /** Alpha set per frame (the beat lines fade with the zoom). */
    gridBeat: stroke(colors.textTertiary, StyleSheet.hairlineWidth),
    label: fill(colors.textSecondary),
    playhead: stroke(colors.primary, PLAYHEAD_WIDTH),
    playheadHandle: fill(colors.primary),
    punch: (() => {
      const paint = stroke(colors.primary, 1.5);
      paint.setPathEffect(Skia.PathEffect.MakeDash([4, 4], 0));
      return paint;
    })(),
    /** The soft shadow under a lane being dragged (alpha set per frame). */
    liftShadow: (() => {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color('black'));
      paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, LIFT_SHADOW_BLUR, true));
      return paint;
    })(),
    /** Layer paint for a lane being dragged (its alpha makes it a bit see-through). */
    liftLayer: Skia.Paint(),
    /** Layer paint for clips of silent (muted / not soloed) tracks. */
    silent: (() => {
      const paint = Skia.Paint();
      paint.setAlphaf(0.35);
      return paint;
    })(),
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  timeArea: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  // The clip action bar floats over the bottom of the lanes, centered in the time area.
  actionBar: { position: 'absolute', right: 0, bottom: 12, alignItems: 'center' },
  corner: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: RULER_SIZE,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    // A solid right edge, so the toggle ends cleanly where the ruler starts.
    borderRightWidth: 1,
  },
  // The icon stays centered over the arm buttons whether the mixer is open or not.
  cornerIcon: { width: CONTROLS_WIDTH, alignItems: 'center' },
  pressed: { opacity: 0.6 },
});
