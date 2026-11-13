import {
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
import { useEffect, useState } from 'react';
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
  useSharedValue,
  withDecay,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Icon } from '@/components/ui';
import type { Project } from '@/features/projects/projects-repo';
import { useTheme, type ThemeColors } from '@/theme';

import { LaneOverlay } from './lane-overlay';
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
import { useTakePeaks } from './use-take-peaks';
import { waveformPaths } from './waveform-path';
import { LEVEL_COUNT, LEVEL_FACTOR, maxAmplitude, peaksPerSecond } from './waveform-peaks';

/** Height of the ruler strip: tall enough to grab with a finger and drag the playhead. */
const RULER_SIZE = 32;
/** Touches this far below the ruler still scrub (it's a thin target). */
const RULER_SLOP = 12;
/** Space before 0:00, so the playhead (and its handle) at the start isn't cut off by the edge. */
const LEADING_SPACE = 14;
const CLIP_INSET = 3;
const CLIP_RADIUS = 6;
const PLAYHEAD_WIDTH = 2;
const PLAYHEAD_HANDLE = 7;
/** Skia resolves fonts through the system font manager, which doesn't know RN's 'System' alias. */
const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

/** The take being recorded, drawn live on its track's lane. */
export type LiveTake = {
  /** Timeline position where recording started. */
  start: number;
  trackId: string;
  /** Interleaved `[min, max]` pairs at `peaksPerSecond`, appended as audio arrives. */
  peaks: SharedValue<number[]>;
  /** Loudest absolute sample so far (0…1), so all waveforms share one scale while recording. */
  peak: SharedValue<number>;
  peaksPerSecond: number;
};

type ClipShape = {
  start: number;
  duration: number;
  lane: number;
  /** Muted, or another track is soloed: drawn faded. */
  silent: boolean;
  /** One path per detail level, in clip-local seconds × amplitude (-1…1); null while loading. */
  waveform: SkPath[] | null;
  peaksPerSecond: number;
};

/**
 * The project timeline, drawn with Skia on the UI thread: time runs left to right, tracks are
 * rows. Ruler on top, lanes with clips and waveforms, the playhead on top.
 *
 * Lanes have a fixed height (`LANE_HEIGHT`) and scroll vertically when they don't fit. A pinned
 * column on the left (`TrackColumn`) follows that scroll but not time: arm buttons, expanded into a
 * mixer (mute, solo, volume) by the button in the corner above it. The canvas and its gestures cover
 * only the time area right of the column, so expanding it narrows the time area. Names, "+ New Track" and the
 * "N more" chevrons are RN views over the lanes (`LaneOverlay`).
 *
 * Gestures: pan scrolls (with momentum, both axes), pinch zooms around the fingers, a tap anywhere
 * moves the playhead there, and dragging on the ruler scrubs the playhead (released: seek).
 * Waveforms share one vertical scale per project (the loudest take fills its lane), so relative
 * loudness between takes stays true.
 */
export function Timeline({
  project,
  playhead,
  following,
  liveTake,
  armedTrackId,
  addTrackDisabled,
  onSeek,
  onArm,
  onEditTrack,
  onAddTrack,
  onToggleMute,
  onToggleSolo,
  onVolumeLive,
  onVolumeCommit,
}: {
  project: Project;
  /** Playhead position in seconds, animated by the transport. */
  playhead: SharedValue<number>;
  /** Playing or recording: keep the playhead in view until the user scrolls. */
  following: boolean;
  /** The take being recorded, or null. */
  liveTake: LiveTake | null;
  armedTrackId: string | null;
  addTrackDisabled: boolean;
  onSeek: (time: number) => void;
  onArm: (trackId: string) => void;
  onEditTrack: (trackId: string) => void;
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

  const peaks = useTakePeaks(Object.values(project.takes).map((take) => take.path));
  const anySolo = project.tracks.some((track) => track.solo);
  const clips: ClipShape[] = project.tracks.flatMap((track, lane) =>
    track.clips.map((clip) => {
      const take = project.takes[clip.takeId];
      const levels = take ? peaks[take.path] : undefined;
      return {
        start: clip.start,
        duration: clip.duration,
        lane,
        silent: anySolo ? !track.solo : track.muted,
        waveform: levels ? waveformPaths(levels, clip.offset, clip.duration) : null,
        peaksPerSecond: levels?.[0] ? peaksPerSecond(levels[0]) : 0,
      };
    }),
  );
  // Loudest sample over the project's takes (the coarsest level keeps every take's extremes).
  const projectPeak = Object.values(peaks).reduce(
    (loudest, levels) => Math.max(loudest, maxAmplitude(levels[levels.length - 1] ?? levels[0])),
    0,
  );
  const liveLane = liveTake
    ? project.tracks.findIndex((track) => track.id === liveTake.trackId)
    : -1;

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

  const seekable = (x: number) => {
    'worklet';
    return clamp(
      pointToTime(x - LEADING_SPACE, scroll.get(), zoom.get()),
      0,
      contentDuration(duration),
    );
  };

  const pan = usePanGesture({
    onBegin: (event) => {
      'worklet';
      cancelAnimation(scroll);
      scrubbing.set(!isRecording && event.y <= RULER_SIZE + RULER_SLOP);
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

  // A tap anywhere moves the playhead (T5 will make taps on clips select them instead).
  const tap = useTapGesture({
    onActivate: (event) => {
      'worklet';
      scheduleOnRN(onSeek, seekable(event.x));
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, tap);

  const picture = useDerivedValue(() =>
    createPicture((canvas) => {
      const z = zoom.get();
      if (z <= 0) return;
      const s = scroll.get();
      const ls = laneScroll.get();
      const scrubbed = scrubTime.get();
      const position = scrubbed >= 0 ? scrubbed : playhead.get();
      const gain = waveformGain(Math.max(projectPeak, liveTake ? liveTake.peak.get() : 0));
      const laneTop = (index: number) => RULER_SIZE + index * lane - ls;
      const visibleStart = s - LEADING_SPACE / z;
      const visibleEnd = s + timeWidth / z;
      const toX = (time: number) => LEADING_SPACE + (time - s) * z;

      // Lanes.
      for (let index = 0; index < trackCount; index++) {
        const top = laneTop(index);
        canvas.drawRect(
          Skia.XYWHRect(0, top, viewWidth, lane),
          index % 2 === 1 ? paints.laneAlt : paints.lane,
        );
        canvas.drawLine(0, top + lane, viewWidth, top + lane, paints.separator);
      }

      // Clips and their waveforms.
      for (const clip of clips) {
        const x0 = toX(clip.start);
        const width = clip.duration * z;
        if (x0 > viewWidth || x0 + width < 0) continue;
        const top = laneTop(clip.lane) + CLIP_INSET;
        const height = lane - CLIP_INSET * 2;
        const rect = Skia.XYWHRect(x0, top, width, height);
        const rrect = Skia.RRectXY(rect, CLIP_RADIUS, CLIP_RADIUS);
        if (clip.silent) canvas.saveLayer(paints.silent);
        canvas.drawRRect(rrect, paints.clip);
        canvas.drawRRect(rrect, paints.clipBorder);
        canvas.drawLine(x0, top + height / 2, x0 + width, top + height / 2, paints.centerLine);
        const path = clip.waveform
          ? clip.waveform[waveformLevel(clip.peaksPerSecond, z, LEVEL_COUNT, LEVEL_FACTOR)]
          : undefined;
        if (path) {
          canvas.save();
          canvas.clipRect(rect, ClipOp.Intersect, true);
          canvas.translate(x0, top + height / 2);
          canvas.scale(z, (height / 2 - CLIP_INSET) * gain);
          canvas.drawPath(path, paints.waveform);
          canvas.restore();
        }
        if (clip.silent) canvas.restore();
      }

      // The take being recorded, on its track's lane, with the waveform received so far.
      if (liveTake && liveLane >= 0 && position > liveTake.start) {
        const x0 = toX(liveTake.start);
        const top = laneTop(liveLane) + CLIP_INSET;
        const height = lane - CLIP_INSET * 2;
        const rect = Skia.XYWHRect(x0, top, (position - liveTake.start) * z, height);
        // It replaces what's under it on the track, so cover that up first.
        const rrect = Skia.RRectXY(rect, CLIP_RADIUS, CLIP_RADIUS);
        canvas.drawRRect(rrect, liveLane % 2 === 1 ? paints.laneAlt : paints.lane);
        canvas.drawRRect(rrect, paints.recording);
        drawLivePeaks(canvas, {
          data: liveTake.peaks.get(),
          perSecond: liveTake.peaksPerSecond,
          start: liveTake.start,
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

      // Ruler: ticks along the bottom edge, labels above them.
      const steps = rulerSteps(z);
      canvas.drawRect(Skia.XYWHRect(0, 0, viewWidth, RULER_SIZE), paints.ruler);
      const firstTick = Math.max(0, Math.floor(visibleStart / steps.tick));
      const lastTick = Math.ceil(visibleEnd / steps.tick);
      for (let index = firstTick; index <= lastTick; index++) {
        const time = index * steps.tick;
        const x = toX(time);
        const isLabel = isMultiple(time, steps.label);
        canvas.drawLine(x, RULER_SIZE - (isLabel ? 10 : 5), x, RULER_SIZE, paints.tick);
      }
      canvas.drawLine(0, RULER_SIZE, viewWidth, RULER_SIZE, paints.separator);
      const firstLabel = Math.max(0, Math.floor(visibleStart / steps.label));
      const lastLabel = Math.ceil(visibleEnd / steps.label);
      const labelY = RULER_SIZE - 13;
      for (let index = firstLabel; index <= lastLabel; index++) {
        const x = toX(index * steps.label);
        canvas.drawText(formatRulerTime(index * steps.label), x + 4, labelY, paints.label, font);
      }

      // Playhead, on top of everything, with a handle on the ruler to show it can be dragged.
      const x = toX(position);
      const playheadEnd = Math.min(viewHeight, RULER_SIZE + trackCount * lane - ls);
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
            onPress={() => setMixerOpen((open) => !open)}
            style={({ pressed }) => [
              styles.corner,
              {
                width: columnWidth,
                backgroundColor: mixerOpen
                  ? theme.colors.surfacePressed
                  : theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
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
            armedTrackId={armedTrackId}
            armDisabled={isRecording}
            draft={draft}
            onArm={onArm}
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
            draft={draft}
            editDisabled={isRecording}
            addTrackDisabled={addTrackDisabled}
            onEdit={onEditTrack}
            onAddTrack={onAddTrack}
          />
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
    separator: stroke(colors.border, StyleSheet.hairlineWidth),
    clip: fill(colors.clip),
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
    label: fill(colors.textSecondary),
    playhead: stroke(colors.primary, PLAYHEAD_WIDTH),
    playheadHandle: fill(colors.primary),
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
  corner: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: RULER_SIZE,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  // The icon stays centered over the arm buttons whether the mixer is open or not.
  cornerIcon: { width: CONTROLS_WIDTH, alignItems: 'center' },
  pressed: { opacity: 0.6 },
});
