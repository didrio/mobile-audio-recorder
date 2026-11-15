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
import {
  dragLoopEdge,
  LOOP_EDGE_START,
  MIN_LOOP_SECONDS,
  type LoopRegion,
} from '@/features/audio/loop-math';
import { barSeconds, beatSeconds, isCompound } from '@/features/audio/tempo';
import { canSplitAt, MIN_CLIP_SECONDS, type ClipPlacement } from '@/features/project/edit-commands';
import {
  DEFAULT_SECTION_BARS,
  DEFAULT_SECTION_SECONDS,
  MIN_SECTION_SECONDS,
  SECTION_COLORS,
  sectionColorToken,
  type SectionColor,
} from '@/features/project/sections';
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
import { activeSnapStep, gridSteps, LINE_BAR, LINE_GROUP, lineKind, stickyTime } from './grid-math';
import { LaneOverlay } from './lane-overlay';
import { autoScrollSpeed, laneSlotDuringDrag, laneTopDuringDrag } from './reorder-math';
import { SectionActionBar } from './section-action-bar';
import {
  dragSection,
  neighborBounds,
  newSectionWindow,
  sectionAt,
  type SectionWindow,
} from './section-math';
import { drawSectionRail, type RailPaints, type RailSection } from './section-rail';
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
  livePeakPoint,
  livePeakRange,
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
/** Height of the section rail above the ruler (T18). */
const RAIL_SIZE = 30;
/** Rail + ruler: where the lanes start. */
const HEADER_SIZE = RAIL_SIZE + RULER_SIZE;
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
const GRID_BEAT_ALPHA = 0.32;
/** With Snap off the lines are dotted and this much fainter (Ableton-style: still there to read). */
const GRID_LOOSE_FADE = 0.65;
const GRID_DASH = [2, 3];
/** The loop region's handles: tabs this wide just inside its edges, grabbed this far out and in. */
const LOOP_TAB_WIDTH = 6;
const LOOP_TAB_INSET = 4;
const LOOP_REACH_OUT = 8;
const LOOP_REACH_IN = 22;
/** What a drag holds: a clip or a section. */
const KIND_CLIP = 0;
const KIND_SECTION = 1;
const RAIL_HINT = 'Tap here to add a section';
/** A new section starts at the previous one's end (or 0:00) when the tap is this close to it (points). */
const RAIL_TAP_REACH = 24;
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
  /** Clip gain (linear, T16): scales the waveform. Fades in seconds: drawn over the clip's corners. */
  gain: number;
  fadeIn: number;
  fadeOut: number;
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
  /** Open the clip's options (gain, fades, restore; T16). The clip stays selected. */
  onOptions: (clipId: string) => void;
  onDelete: (clipId: string) => void;
};

/** What the timeline can do to sections (`null` turns section editing off, e.g. while recording). */
export type SectionEditing = {
  /** An empty spot on the rail was tapped: add a section there (asks for its name). */
  onAdd: (window: SectionWindow) => void;
  /** A drag of a section or one of its handles ended there (one undo step). Returns whether it changed. */
  onPlace: (sectionId: string, window: SectionWindow, label: string) => boolean;
  onRename: (sectionId: string) => void;
  onColor: (sectionId: string, color: SectionColor) => void;
  onNotes: (sectionId: string) => void;
  onDelete: (sectionId: string) => void;
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
 * Loop region (T26): a band on the ruler (tinted while Loop is on, faint while off) with a handle
 * tab inside each end; the lanes inside it are tinted while Loop is on. The handles are hit-tested
 * before the ruler's scrub: dragging one resizes the region (whole bars while the grid snaps), and
 * the drop is one `onLoopRegionChange` call (not an undo step).
 * Sections (T18): a rail above the ruler with the song's sections. A tap on one jumps the playhead to
 * its start and selects it (`SectionActionBar`); a tap on an empty spot asks for a new one there. A
 * selected section is moved and resized like a clip (same drag state, `dragKind`), a long press picks an
 * unselected one up; sections stop at their neighbors and snap to bars while the grid snaps.
 * Waveforms share one vertical scale per project (the loudest take fills its lane), so relative
 * loudness between takes stays true.
 */
export function Timeline({
  project,
  playhead,
  revealPlayhead,
  following,
  liveTake,
  snap,
  loopOn,
  loopRegion,
  armedTrackId,
  addTrackDisabled,
  clipEditing,
  sectionEditing,
  onSeek,
  onLoopRegionChange,
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
  /** Snap clips and the playhead to the grid lines (only while the grid shows). */
  snap: boolean;
  /** Playback loops in `loopRegion` (lanes tinted); the region shows on the ruler either way. */
  loopOn: boolean;
  loopRegion: LoopRegion | null;
  armedTrackId: string | null;
  addTrackDisabled: boolean;
  clipEditing: ClipEditing | null;
  sectionEditing: SectionEditing | null;
  onSeek: (time: number) => void;
  /** A loop handle was dragged (called once, on release). */
  onLoopRegionChange: (region: LoopRegion) => void;
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
  const lanesViewport = Math.max(0, viewHeight - HEADER_SIZE);
  const maxLaneScroll = laneScrollMax(lanesViewport, trackCount, lane, NEW_TRACK_ROW_HEIGHT);
  const duration = project.duration;
  const isRecording = liveTake != null;
  // The bar/beat grid (T9): lines in the lanes, bar numbers on the ruler, and a snap target for drags.
  const grid = project.grid;
  /** Dragged clips and the playhead are pulled to grid lines (T31). */
  const snapToGrid = grid && snap;
  const meter = { bpm: project.bpm, beatsPerBar: project.beatsPerBar, beatUnit: project.beatUnit };

  const editable = clipEditing != null && !isRecording;
  const sectionEditable = sectionEditing != null && !isRecording;
  // At most one thing is selected: a clip or a section.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const selectClip = (clipId: string | null) => {
    setSelectedId(clipId);
    setSelectedSectionId(null);
  };
  const selectSection = (sectionId: string | null) => {
    setSelectedSectionId(sectionId);
    setSelectedId(null);
  };
  const sections: RailSection[] = project.sections.map((section) => ({
    id: section.id,
    name: section.name,
    color: section.color,
    start: section.start,
    duration: section.duration,
    hasNotes: section.notes.length > 0,
  }));
  const sectionsEnd = sections.reduce((end, s) => Math.max(end, s.start + s.duration), 0);
  /** How far the timeline's content reaches: the last clip or section. */
  const contentEnd = Math.max(duration, sectionsEnd);
  const selectedSectionIndex = sectionEditable
    ? sections.findIndex((section) => section.id === selectedSectionId)
    : -1;
  const selectedSection = sections[selectedSectionIndex] ?? null;
  const selectedSectionKey = selectedSection?.id ?? null;
  const sectionSelection = useSharedValue<string | null>(null);
  useEffect(() => {
    sectionSelection.set(selectedSectionKey);
  }, [sectionSelection, selectedSectionKey]);
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
        gain: clip.gain,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
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
  const sectionFont = matchFont({
    fontFamily: FONT_FAMILY,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  });

  const zoom = useSharedValue(0);
  const scroll = useSharedValue(0);
  const laneScroll = useSharedValue(0);
  const follow = useSharedValue(true);
  const pinchStartZoom = useSharedValue(0);
  /** Pan started on the ruler: it moves the playhead instead of scrolling. */
  const scrubbing = useSharedValue(false);
  /** Where the playhead is being dragged to, or -1. */
  const scrubTime = useSharedValue(-1);
  /** The grid line the scrubbed playhead is stuck to, or -1 (for the haptic). */
  const scrubSnap = useSharedValue(-1);
  // The loop region as the picture draws it (-1: none): from the props, or live while a handle is
  // dragged (`loopEdge`: which one; the region before the drag, and the grab's offset from the edge).
  const loopStart = useSharedValue(loopRegion?.start ?? -1);
  const loopEnd = useSharedValue(loopRegion?.end ?? -1);
  const loopActive = useSharedValue(loopOn);
  const loopEdge = useSharedValue(0);
  const loopOrigin = useSharedValue<LoopRegion>({ start: 0, end: 0 });
  const loopGrab = useSharedValue(0);
  const savedLoopStart = loopRegion?.start ?? -1;
  const savedLoopEnd = loopRegion?.end ?? -1;
  useEffect(() => {
    loopStart.set(savedLoopStart);
    loopEnd.set(savedLoopEnd);
  }, [loopStart, loopEnd, savedLoopStart, savedLoopEnd]);
  useEffect(() => {
    loopActive.set(loopOn);
  }, [loopActive, loopOn]);

  // Fit the zoom and scroll to the view: on first layout, rotation and when the idea grows. Runs on
  // the UI thread: scroll is moved there (gestures, following), so a JS-side read could be stale and
  // write an old position back (seen right after recording: the view jumped away from the playhead).
  useEffect(() => {
    if (timeWidth <= 0) return;
    scheduleOnUI(() => {
      'worklet';
      const extent = Math.max(contentEnd, playhead.get(), loopEnd.get());
      const nextZoom =
        zoom.get() > 0 ? clampZoom(zoom.get(), timeWidth, extent) : defaultZoom(timeWidth, extent);
      zoom.set(nextZoom);
      scroll.set(clampScroll(scroll.get(), timeWidth, nextZoom, extent));
      laneScroll.set(clamp(laneScroll.get(), 0, maxLaneScroll));
    });
  }, [timeWidth, contentEnd, maxLaneScroll, zoom, scroll, laneScroll, playhead, loopEnd]);

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
          Math.max(contentEnd, position),
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
          Math.max(contentEnd, position),
        ),
      );
    },
  );

  const freeSeekable = (x: number) => {
    'worklet';
    return clamp(
      pointToTime(x - LEADING_SPACE, scroll.get(), zoom.get()),
      0,
      contentDuration(contentEnd),
    );
  };

  // Where a touch on the ruler or lanes puts the playhead: the touch's time, pulled onto a grid line
  // within SNAP_POINTS (so it doesn't depend on the zoom) while Snap is on.
  const seekable = (x: number) => {
    'worklet';
    const time = freeSeekable(x);
    if (!snapToGrid) return time;
    const z = zoom.get();
    return clamp(
      stickyTime(time, activeSnapStep(grid, snap, meter, z), SNAP_POINTS / z),
      0,
      contentDuration(contentEnd),
    );
  };

  // Clip drag state (UI thread). Which gesture holds a clip: 0 none, 1 the pan (dragging the selected
  // clip or its handles), 2 the long-press pickup.
  const owner = useSharedValue(0);
  /** What is dragged (`KIND_CLIP` / `KIND_SECTION`), and a dragged section's room between its neighbors. */
  const dragKind = useSharedValue(KIND_CLIP);
  const dragMin = useSharedValue(0);
  const dragMax = useSharedValue(0);
  /** Bumped each time a section dragged along bars moves to another one (for the haptic). */
  const barTick = useSharedValue(0);
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
  /** The clip or section held before pickup (index, kind), its id and how far along the hold is (0…1). */
  const pickIndex = useSharedValue(-1);
  const pickKind = useSharedValue(KIND_CLIP);
  const pressId = useSharedValue<string | null>(null);
  const press = useSharedValue(0);
  /** The drag whose drop is waiting for its saved edit to render. */
  const awaitingSerial = useRef(-1);

  const timeAt = (x: number) => {
    'worklet';
    return pointToTime(x - LEADING_SPACE, scroll.get(), zoom.get());
  };

  /** The loop handle under a point (`LOOP_EDGE_START`/`_END`), or 0. The nearer edge wins. */
  const loopEdgeAt = (x: number, y: number): number => {
    'worklet';
    const start = loopStart.get();
    const end = loopEnd.get();
    if (
      isRecording ||
      y < RAIL_SIZE ||
      y > HEADER_SIZE + RULER_SLOP ||
      start < 0 ||
      !(end > start)
    ) {
      return 0;
    }
    const z = zoom.get();
    // Positive inside the region.
    const intoStart = (timeAt(x) - start) * z;
    const intoEnd = (end - timeAt(x)) * z;
    const nearStart = intoStart >= -LOOP_REACH_OUT && intoStart <= LOOP_REACH_IN;
    const nearEnd = intoEnd >= -LOOP_REACH_OUT && intoEnd <= LOOP_REACH_IN;
    if (nearStart && nearEnd) return Math.abs(intoStart) <= Math.abs(intoEnd) ? 1 : 2;
    return nearStart ? 1 : nearEnd ? 2 : 0;
  };

  /** Index of the clip under a point, or -1. */
  const clipAt = (x: number, y: number) => {
    'worklet';
    const contentY = y - HEADER_SIZE + laneScroll.get();
    if (contentY < 0 || contentY >= trackCount * lane) return -1;
    return itemAt(clips, timeAt(x), Math.floor(contentY / lane));
  };

  const startDrag = (index: number, part: DragPart, x: number, y: number) => {
    'worklet';
    const clip = clips[index];
    if (!clip) return;
    dragKind.set(KIND_CLIP);
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

  const startSectionDrag = (index: number, part: DragPart, x: number) => {
    'worklet';
    const section = sections[index];
    if (!section) return;
    const bounds = neighborBounds(sections, index);
    dragKind.set(KIND_SECTION);
    dragMin.set(bounds.min);
    dragMax.set(bounds.max);
    dragSerial.set(dragSerial.get() + 1);
    dragIndex.set(index);
    dragId.set(section.id);
    dragPart.set(part);
    dragWin.set({ start: section.start, offset: 0, duration: section.duration });
    grabTime.set(timeAt(x));
    fingerX.set(x);
    snapTime.set(-1);
  };

  // The dragged section's window for where the finger is now: whole bars while the grid snaps, else
  // pulled onto 0:00, the playhead and other sections' and clips' edges; always between its neighbors.
  const updateSectionDrag = () => {
    'worklet';
    const section = sections[dragIndex.get()];
    const z = zoom.get();
    if (!section || z <= 0) return;
    const part = dragPart.get() as DragPart;
    const origin = { start: section.start, duration: section.duration };
    const step = snapToGrid ? barSeconds(meter) : 0;
    let delta = timeAt(fingerX.get()) - grabTime.get();
    let guide = -1;
    if (step === 0) {
      const candidates = [0, playhead.get()];
      for (const other of sections) {
        if (other.id !== section.id) candidates.push(other.start, other.start + other.duration);
      }
      for (const clip of clips) candidates.push(clip.start, clip.start + clip.duration);
      const snapped = snapDrag(part, origin, delta, candidates, SNAP_POINTS / z);
      delta = snapped.delta;
      guide = snapped.snapTime;
    }
    const next = dragSection(
      part,
      origin,
      delta,
      { min: dragMin.get(), max: dragMax.get() },
      { step, minDuration: step > 0 ? step : MIN_SECTION_SECONDS },
    );
    const landed =
      guide >= 0 &&
      (Math.abs(next.start - guide) < 1e-6 || Math.abs(next.start + next.duration - guide) < 1e-6);
    const before = dragWin.get();
    if (step > 0 && (before.start !== next.start || before.duration !== next.duration)) {
      barTick.set(barTick.get() + 1);
    }
    dragWin.set({ start: next.start, offset: 0, duration: next.duration });
    snapTime.set(landed ? guide : -1);
  };

  // The dragged clip's window and lane for where the finger (and the view) is now.
  const updateDrag = () => {
    'worklet';
    if (dragKind.get() === KIND_SECTION) {
      updateSectionDrag();
      return;
    }
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
      activeSnapStep(grid, snap, meter, z),
    );
    const next = dragWindow(part, origin, snapped.delta, clip.takeDuration, MIN_CLIP_SECONDS);
    // A limit (0:00, the take's bounds) can stop the edge short of the snap point: no guide then.
    const guide = snapped.snapTime;
    const landed =
      guide >= 0 &&
      (Math.abs(next.start - guide) < 1e-6 || Math.abs(next.start + next.duration - guide) < 1e-6);
    dragWin.set(next);
    snapTime.set(landed ? guide : -1);
    if (part === DRAG_MOVE) {
      dragRow.set(rowAt(fingerY.get() - HEADER_SIZE, laneScroll.get(), lane, trackCount));
    }
  };

  // Scrolls the view while a dragged clip is near an edge, so it can go anywhere.
  const autoScroll = useFrameCallback((frame) => {
    'worklet';
    const z = zoom.get();
    if (!dragging.get() || z <= 0) return;
    const sx = autoScrollSpeed(fingerX.get(), viewWidth, AUTO_SCROLL_EDGE, AUTO_SCROLL_SPEED);
    const sy =
      dragPart.get() === DRAG_MOVE && dragKind.get() === KIND_CLIP
        ? autoScrollSpeed(
            fingerY.get() - HEADER_SIZE,
            lanesViewport,
            AUTO_SCROLL_EDGE,
            AUTO_SCROLL_SPEED,
          )
        : 0;
    if (sx === 0 && sy === 0) return;
    const seconds = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const window = dragWin.get();
    const extent = Math.max(contentEnd, playhead.get(), window.start + window.duration);
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
  const pickedUp = (kind: number, id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (kind === KIND_SECTION) selectSection(id);
    else selectClip(id);
    autoScroll.setActive(true);
  };
  const commitSectionDrag = (
    serial: number,
    sectionId: string,
    window: SectionWindow,
    label: string,
  ) => {
    if (sectionEditing?.onPlace(sectionId, window, label)) {
      awaitingSerial.current = serial;
    } else if (dragSerial.get() === serial) {
      clearDrag();
    }
  };
  const requestSection = (window: SectionWindow) => sectionEditing?.onAdd(window);
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
    if (dragKind.get() === KIND_SECTION) {
      const section = sections[dragIndex.get()];
      if (!section || (window.start === section.start && window.duration === section.duration)) {
        dragId.set(null);
        dragIndex.set(-1);
        return;
      }
      scheduleOnRN(
        commitSectionDrag,
        dragSerial.get(),
        section.id,
        { start: window.start, duration: window.duration },
        part === DRAG_MOVE ? 'Move section' : 'Resize section',
      );
      return;
    }
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

  // A section dragged along bars clicking from bar to bar.
  useAnimatedReaction(
    () => barTick.get(),
    (now, before) => {
      if (before != null && now !== before) scheduleOnRN(snapped);
    },
  );

  // A loop handle clicking from bar to bar while the grid snaps.
  useAnimatedReaction(
    () => {
      const edge = loopEdge.get();
      return edge === 0 ? -1 : edge === LOOP_EDGE_START ? loopStart.get() : loopEnd.get();
    },
    (now, before) => {
      if (snapToGrid && now >= 0 && before != null && before >= 0 && now !== before) {
        scheduleOnRN(snapped);
      }
    },
  );

  // The playhead clicking onto a grid line as it's dragged along the ruler.
  useAnimatedReaction(
    () => scrubSnap.get(),
    (now, before) => {
      if (now >= 0 && now !== before) scheduleOnRN(snapped);
    },
  );

  const pan = usePanGesture({
    onBegin: (event) => {
      'worklet';
      cancelAnimation(scroll);
      panScrolling.set(false);
      // A loop handle: this pan resizes the region.
      const edge = loopEdgeAt(event.x, event.y);
      loopEdge.set(edge);
      if (edge !== 0) {
        const region = { start: loopStart.get(), end: loopEnd.get() };
        loopOrigin.set(region);
        loopGrab.set(timeAt(event.x) - (edge === LOOP_EDGE_START ? region.start : region.end));
        scrubbing.set(false);
        return;
      }
      // On the selected section: this pan moves it or (near an edge) resizes it. Else it scrolls.
      if (event.y < RAIL_SIZE) {
        scrubbing.set(false);
        const section = sections[selectedSectionIndex];
        if (!section || owner.get() !== 0) return;
        const part = grabPart(section, timeAt(event.x), HANDLE_REACH / zoom.get());
        if (part === DRAG_NONE) return;
        owner.set(1);
        startSectionDrag(selectedSectionIndex, part, event.x);
        return;
      }
      const onRuler = event.y <= HEADER_SIZE + RULER_SLOP;
      scrubbing.set(!isRecording && onRuler);
      // On the selected clip: this pan drags it (an edge trims, the body moves).
      const clip = clips[selectedIndex];
      if (onRuler || !clip || owner.get() !== 0) return;
      const contentY = event.y - HEADER_SIZE + laneScroll.get();
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
      } else if (owner.get() === 0 && !scrubbing.get() && loopEdge.get() === 0) {
        panScrolling.set(true);
        press.set(0);
      }
    },
    onUpdate: (event) => {
      'worklet';
      const edge = loopEdge.get();
      if (edge !== 0) {
        // Whole bars while the grid snaps (and at least one bar), else free (at least a second).
        const step = snapToGrid ? barSeconds(meter) : 0;
        const next = dragLoopEdge(
          loopOrigin.get(),
          edge === LOOP_EDGE_START ? 1 : 2,
          timeAt(event.x) - loopGrab.get(),
          { step, minLength: step > 0 ? step : MIN_LOOP_SECONDS },
        );
        loopStart.set(next.start);
        loopEnd.set(next.end);
        return;
      }
      if (scrubbing.get()) {
        const time = seekable(event.x);
        scrubTime.set(time);
        scrubSnap.set(snapToGrid && time !== freeSeekable(event.x) ? time : -1);
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
      const extent = Math.max(contentEnd, playhead.get(), loopEnd.get());
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
      const extent = Math.max(contentEnd, playhead.get(), loopEnd.get());
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
      scrubSnap.set(-1);
      if (owner.get() === 1) finishDrag();
      if (loopEdge.get() !== 0) {
        loopEdge.set(0);
        const origin = loopOrigin.get();
        const region = { start: loopStart.get(), end: loopEnd.get() };
        if (region.start !== origin.start || region.end !== origin.end) {
          scheduleOnRN(onLoopRegionChange, region);
        }
      }
    },
  });

  // Holding a clip that isn't selected picks it up: it lights up at once and fills in over the hold
  // (as track reorder does), then lifts with a haptic and follows the finger.
  const pickup = usePanGesture({
    enabled: editable || sectionEditable,
    activateAfterLongPress: LONG_PRESS_MS,
    onBegin: (event) => {
      'worklet';
      pickIndex.set(-1);
      if (event.y < RAIL_SIZE) {
        const index = sectionEditable ? sectionAt(sections, timeAt(event.x)) : -1;
        const section = sections[index];
        if (!section || section.id === selectedSectionKey) return;
        pickIndex.set(index);
        pickKind.set(KIND_SECTION);
        pressId.set(section.id);
        press.set(PRESS_START);
        press.set(withTiming(1, { duration: LONG_PRESS_MS }));
        return;
      }
      if (!editable || event.y <= HEADER_SIZE + RULER_SLOP) return;
      const index = clipAt(event.x, event.y);
      const clip = clips[index];
      if (!clip || clip.id === selectedClipId) return;
      pickIndex.set(index);
      pickKind.set(KIND_CLIP);
      pressId.set(clip.id);
      press.set(PRESS_START);
      press.set(withTiming(1, { duration: LONG_PRESS_MS }));
    },
    onActivate: (event) => {
      'worklet';
      const index = pickIndex.get();
      const kind = pickKind.get();
      const item = kind === KIND_SECTION ? sections[index] : clips[index];
      if (!item || owner.get() !== 0 || panScrolling.get()) return;
      owner.set(2);
      if (kind === KIND_SECTION) startSectionDrag(index, DRAG_MOVE, event.x);
      else startDrag(index, DRAG_MOVE, event.x, event.y);
      dragging.set(true);
      follow.set(false);
      press.set(withTiming(0, { duration: LIFT_MS }));
      lift.set(withTiming(1, { duration: LIFT_MS }));
      scheduleOnRN(pickedUp, kind, item.id);
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
      const extent = Math.max(contentEnd, playhead.get(), loopEnd.get());
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
      // A tap on a loop handle does nothing (it's there to be dragged).
      if (loopEdgeAt(event.x, event.y) !== 0) return;
      // The rail: a section jumps the playhead to its start (and is selected); an empty spot adds one.
      if (event.y < RAIL_SIZE) {
        const time = timeAt(event.x);
        const section = sections[sectionAt(sections, time)];
        if (section) {
          if (sectionEditable) scheduleOnRN(selectSection, section.id);
          scheduleOnRN(onSeek, section.start);
          return;
        }
        scheduleOnRN(selectClip, null);
        if (!sectionEditable) return;
        const bar = barSeconds(meter);
        const window = newSectionWindow(time, sections, {
          step: snapToGrid ? bar : 0,
          defaultLength: grid ? DEFAULT_SECTION_BARS * bar : DEFAULT_SECTION_SECONDS,
          minLength: MIN_SECTION_SECONDS,
          reach: RAIL_TAP_REACH / zoom.get(),
        });
        if (window) scheduleOnRN(requestSection, window);
        return;
      }
      const clip = editable && event.y > HEADER_SIZE ? clips[clipAt(event.x, event.y)] : undefined;
      if (clip) {
        scheduleOnRN(selectClip, clip.id);
        return;
      }
      scheduleOnRN(onSeek, seekable(event.x));
      scheduleOnRN(selectClip, null);
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
        HEADER_SIZE + laneTopDuringDrag(index, lane, lifted, dragTop, progress) - ls;
      const selectedNow = selection.get();
      const selectedSectionNow = sectionSelection.get();
      const dragged = dragId.get();
      const draggedWindow = dragWin.get();
      const draggedRow = dragRow.get();
      const lifting = lift.get();
      const pressAmount = press.get();
      const pressed = pressAmount > 0 ? pressId.get() : null;
      const visibleStart = s - LEADING_SPACE / z;
      const visibleEnd = s + timeWidth / z;
      const toX = (time: number) => LEADING_SPACE + (time - s) * z;
      const loopFrom = loopStart.get();
      const loopTo = loopEnd.get();
      const hasLoop = loopFrom >= 0 && loopTo > loopFrom;
      const looping = hasLoop && loopActive.get();

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
        // Snap on: solid lines. Snap off: the same lines dotted and fainter.
        const style = snapToGrid ? paints.grid : paints.gridLoose;
        style.beat.setAlphaf(
          GRID_BEAT_ALPHA * gridLevels.beatAlpha * (snapToGrid ? 1 : GRID_LOOSE_FADE),
        );
        return { style, bars: bars.detach(), groups: groups.detach(), beats: beats.detach() };
      })();

      const drawLane = (index: number) => {
        const top = laneTop(index);
        canvas.drawRect(
          Skia.XYWHRect(0, top, viewWidth, lane),
          index === lifted ? paints.laneLifted : stripe(index),
        );
        if (looping) {
          const lx = toX(loopFrom);
          canvas.drawRect(Skia.XYWHRect(lx, top, toX(loopTo) - lx, lane), paints.loopLane);
        }
        if (gridPaths) {
          canvas.save();
          canvas.translate(0, top);
          canvas.drawPath(gridPaths.beats, gridPaths.style.beat);
          canvas.drawPath(gridPaths.groups, gridPaths.style.group);
          canvas.drawPath(gridPaths.bars, gridPaths.style.bar);
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
          canvas.scale(z, (height / 2 - CLIP_INSET) * gain * clip.gain);
          canvas.drawPath(path, paints.waveform);
          canvas.restore();
        }
        // Fades (T16): the corner above each fade line is shaded. Fades longer than the clip are
        // drawn shortened together, as the engine plays them (`effectiveFades`).
        const fadeTotal = clip.fadeIn + clip.fadeOut;
        const fadeScale = fadeTotal > length && fadeTotal > 0 ? length / fadeTotal : 1;
        for (const [fade, edge, toward] of [
          [clip.fadeIn * fadeScale * z, x0, 1],
          [clip.fadeOut * fadeScale * z, x0 + width, -1],
        ] as const) {
          if (fade < 0.5) continue;
          const corner = Skia.PathBuilder.Make()
            .moveTo(edge, top)
            .lineTo(edge + toward * fade, top)
            .lineTo(edge, top + height)
            .close()
            .detach();
          canvas.save();
          canvas.clipRRect(rrect, ClipOp.Intersect, true);
          canvas.drawPath(corner, paints.fadeShade);
          canvas.drawLine(edge, top + height, edge + toward * fade, top, paints.fadeLine);
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
          originX: toX(liveTake.peaksStart),
          zoom: z,
          middle: top + height / 2,
          amplitude: (height / 2 - CLIP_INSET) * gain,
          limit: height / 2 - CLIP_INSET,
          paint: paints.liveWaveform,
        });
      }

      // Ruler: ticks along the bottom edge, labels above them. With the grid on it counts bars
      // (1, 2, 3…) instead of minutes and seconds. Drawn in its own coordinates, under the rail.
      canvas.save();
      canvas.translate(0, RAIL_SIZE);
      canvas.drawRect(Skia.XYWHRect(0, 0, viewWidth, RULER_SIZE), paints.ruler);
      // The loop region: a band with a handle tab inside each end (faint while Loop is off).
      if (hasLoop) {
        const x0 = toX(loopFrom);
        const x1 = toX(loopTo);
        if (x1 > 0 && x0 < viewWidth) {
          canvas.drawRect(
            Skia.XYWHRect(x0, 0, x1 - x0, RULER_SIZE),
            looping ? paints.loopBand : paints.loopBandOff,
          );
          const tabPaint = looping ? paints.loopHandle : paints.loopHandleOff;
          const tabWidth = Math.min(LOOP_TAB_WIDTH, (x1 - x0) / 2);
          const tab = (x: number) =>
            canvas.drawRRect(
              Skia.RRectXY(
                Skia.XYWHRect(x, LOOP_TAB_INSET, tabWidth, RULER_SIZE - LOOP_TAB_INSET * 2),
                2,
                2,
              ),
              tabPaint,
            );
          tab(x0);
          tab(x1 - tabWidth);
        }
      }
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
      canvas.restore();

      // The section rail above the ruler.
      drawSectionRail(canvas, {
        sections,
        width: viewWidth,
        height: RAIL_SIZE,
        toX,
        zoom: z,
        selectedId: selectedSectionNow,
        draggedId: dragged,
        dragged: draggedWindow,
        lift: lifting,
        pressedId: pressed,
        pressAmount,
        paints: paints.rail,
        font: sectionFont,
        hint: sectionEditable ? RAIL_HINT : null,
      });

      const playheadEnd = Math.min(viewHeight, HEADER_SIZE + trackCount * lane - ls);

      // The punch point during the run-up: a dashed line down the lanes, a notch on the ruler.
      if (liveTake && position < liveTake.start) {
        const px = toX(liveTake.start);
        canvas.drawLine(px, HEADER_SIZE, px, Math.max(HEADER_SIZE, playheadEnd), paints.punch);
        const notch = Skia.PathBuilder.Make();
        notch.moveTo(px - PUNCH_NOTCH, HEADER_SIZE - PUNCH_NOTCH);
        notch.lineTo(px + PUNCH_NOTCH, HEADER_SIZE - PUNCH_NOTCH);
        notch.lineTo(px, HEADER_SIZE);
        notch.close();
        canvas.drawPath(notch.detach(), paints.playheadHandle);
      }

      // Where a dragged clip or section edge snapped: a guide line down the lanes (and the rail).
      const snap = snapTime.get();
      if (dragged != null && snap >= 0) {
        const sx = toX(snap);
        canvas.drawLine(sx, 0, sx, Math.max(HEADER_SIZE, playheadEnd), paints.snapLine);
      }

      // Playhead, on top of everything (through the rail), with a handle on the ruler to show it can
      // be dragged.
      const x = toX(position);
      canvas.drawLine(x, 0, x, Math.max(HEADER_SIZE, playheadEnd), paints.playhead);
      const handle = Skia.PathBuilder.Make();
      handle.moveTo(x - PLAYHEAD_HANDLE, RAIL_SIZE);
      handle.lineTo(x + PLAYHEAD_HANDLE, RAIL_SIZE);
      handle.lineTo(x + PLAYHEAD_HANDLE, HEADER_SIZE - PLAYHEAD_HANDLE * 2);
      handle.lineTo(x, HEADER_SIZE - PLAYHEAD_HANDLE);
      handle.lineTo(x - PLAYHEAD_HANDLE, HEADER_SIZE - PLAYHEAD_HANDLE * 2);
      handle.close();
      canvas.drawPath(handle.detach(), paints.playheadHandle);
    }),
  );

  const clipCount = clips.length;
  const sectionCount = sections.length;
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
          accessibilityLabel={`Timeline, ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}, ${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}, ${sectionCount} ${sectionCount === 1 ? 'section' : 'sections'}`}>
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
            top={HEADER_SIZE}
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
            top={HEADER_SIZE}
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
                  if (copyId) selectClip(copyId);
                }}
                onOptions={() => clipEditing.onOptions(selected.id)}
                onDelete={() => {
                  clipEditing.onDelete(selected.id);
                  selectClip(null);
                }}
              />
            </View>
          ) : null}
          {selectedSection && sectionEditing ? (
            <View pointerEvents="box-none" style={[styles.actionBar, { left: columnWidth }]}>
              <SectionActionBar
                key={selectedSection.id}
                color={selectedSection.color}
                hasNotes={selectedSection.hasNotes}
                onRename={() => sectionEditing.onRename(selectedSection.id)}
                onColor={(color) => sectionEditing.onColor(selectedSection.id, color)}
                onNotes={() => sectionEditing.onNotes(selectedSection.id)}
                onDelete={() => {
                  sectionEditing.onDelete(selectedSection.id);
                  selectSection(null);
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
    /** x of `start`, the take file's start (before the punch with pre-roll). */
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
  const range = livePeakRange({
    count: live.data.length / 2,
    perSecond: live.perSecond,
    peaksStart: live.start,
    from: live.from,
    to: live.to,
    zoom: live.zoom,
  });
  if (!range) return;
  const { first, last, step, width } = range;
  const builder = Skia.PathBuilder.Make();
  for (let peak = first; peak < last; peak += step) {
    let min = 0;
    let max = 0;
    const end = Math.min(peak + step, last);
    for (let i = peak; i < end; i++) {
      min = Math.min(min, live.data[i * 2] ?? 0);
      max = Math.max(max, live.data[i * 2 + 1] ?? 0);
    }
    const point = livePeakPoint(live.originX, peak, live.perSecond, live.zoom);
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
  const gridPaints = (loose: boolean) => {
    const line = (width: number, alpha: number) => {
      const paint = stroke(colors.textTertiary, width);
      paint.setAlphaf(alpha * (loose ? GRID_LOOSE_FADE : 1));
      if (loose) paint.setPathEffect(Skia.PathEffect.MakeDash(GRID_DASH, 0));
      return paint;
    };
    // The beat paint's alpha is set per frame (the beat lines fade with the zoom).
    return { bar: line(1.5, 0.6), group: line(1, 0.4), beat: line(1, GRID_BEAT_ALPHA) };
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
    loopBand: fill(colors.loop, 0.3),
    loopBandOff: fill(colors.textTertiary, 0.18),
    loopHandle: fill(colors.loop),
    loopHandleOff: fill(colors.textTertiary, 0.8),
    loopLane: fill(colors.loop, 0.08),
    clipBorder: (() => {
      const paint = stroke(colors.waveform, 1);
      paint.setAlphaf(0.45);
      return paint;
    })(),
    centerLine: stroke(colors.waveform, StyleSheet.hairlineWidth),
    fadeShade: fill(colors.background, 0.55),
    fadeLine: stroke(colors.waveform, 1.5),
    waveform: fill(colors.waveform),
    recording: fill(colors.primary, 0.2),
    liveWaveform: fill(colors.primary, 0.8),
    ruler: fill(colors.surfaceMuted),
    tick: stroke(colors.textTertiary, 1),
    tickBeat: stroke(colors.textTertiary, 1),
    /** Grid lines with Snap on: solid, bars strongest, beats clearly lighter. */
    grid: gridPaints(false),
    /** The same lines with Snap off: dotted and fainter. */
    gridLoose: gridPaints(true),
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
    rail: makeRailPaints(colors, fill, stroke),
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

function makeRailPaints(
  colors: ThemeColors,
  fill: (color: string, alpha?: number) => SkPaint,
  stroke: (color: string, width: number) => SkPaint,
): RailPaints {
  const fills = {} as Record<SectionColor, SkPaint>;
  for (const { key } of SECTION_COLORS) fills[key] = fill(colors[sectionColorToken(key)]);
  const shadow = Skia.Paint();
  shadow.setColor(Skia.Color('black'));
  shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 4, true));
  const glyph = stroke(colors.onSection, 1.5);
  glyph.setAlphaf(0.75);
  return {
    background: fill(colors.background),
    separator: stroke(colors.border, StyleSheet.hairlineWidth),
    fills,
    label: fill(colors.onSection),
    selected: stroke(colors.onSection, SELECTED_BORDER),
    handle: fill(colors.onSection),
    glyph,
    press: fill(colors.onSection),
    hint: fill(colors.textTertiary),
    shadow,
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
    height: HEADER_SIZE,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    // A solid right edge, so the toggle ends cleanly where the ruler starts.
    borderRightWidth: 1,
  },
  // The icon stays centered over the arm buttons whether the mixer is open or not.
  cornerIcon: { width: CONTROLS_WIDTH, alignItems: 'center' },
  pressed: { opacity: 0.6 },
});
