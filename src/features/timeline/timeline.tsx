import {
  Canvas,
  ClipOp,
  createPicture,
  matchFont,
  PaintStyle,
  Picture,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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

import type { Project } from '@/features/projects/projects-repo';
import { useTheme, type ThemeColors } from '@/theme';

import { axisLengths, axisMatrix, fromAxes, toAxes, type Orientation } from './timeline-axis';
import {
  clamp,
  clampScroll,
  clampZoom,
  contentDuration,
  defaultZoom,
  followScroll,
  formatRulerTime,
  laneSize,
  maxScroll,
  pointToTime,
  rulerSteps,
  waveformLevel,
  zoomAroundPoint,
} from './timeline-math';
import { useTakePeaks } from './use-take-peaks';
import { waveformPaths } from './waveform-path';
import { LEVEL_COUNT, LEVEL_FACTOR, peaksPerSecond } from './waveform-peaks';

/** Thickness of the ruler band: a column in portrait (room for labels), a strip in landscape. */
const RULER_SIZE: Record<Orientation, number> = { portrait: 44, landscape: 24 };
const CLIP_INSET = 3;
const CLIP_RADIUS = 6;
const PLAYHEAD_WIDTH = 2;
/** Skia resolves fonts through the system font manager, which doesn't know RN's 'System' alias. */
const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

type ClipShape = {
  start: number;
  duration: number;
  lane: number;
  /** One path per detail level, in clip-local seconds × amplitude (-1…1); null while loading. */
  waveform: SkPath[] | null;
  peaksPerSecond: number;
};

/**
 * The project timeline: ruler, track lanes, clips with waveforms and the playhead, drawn with Skia on
 * the UI thread. Scroll (pan, with momentum) and zoom (pinch) live in shared values; tapping the
 * ruler seeks. Works in both orientations through the time/cross mapping in `timeline-axis.ts`.
 */
export function Timeline({
  project,
  orientation,
  playhead,
  following,
  recordingStart,
  onSeek,
}: {
  project: Project;
  orientation: Orientation;
  /** Playhead position in seconds, animated by the transport. */
  playhead: SharedValue<number>;
  /** Playing or recording: keep the playhead in view until the user scrolls. */
  following: boolean;
  /** Timeline position where the take being recorded starts, or null. */
  recordingStart: number | null;
  onSeek: (time: number) => void;
}) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { time: timeLength, cross: crossLength } = axisLengths(
    orientation,
    size.width,
    size.height,
  );
  const rulerSize = RULER_SIZE[orientation];
  const trackCount = project.tracks.length;
  const lane = laneSize(crossLength - rulerSize, trackCount);
  const maxCrossScroll = Math.max(0, rulerSize + trackCount * lane - crossLength);
  const duration = project.duration;
  const matrix = axisMatrix(orientation);

  const peaks = useTakePeaks(Object.values(project.takes).map((take) => take.path));
  const clips: ClipShape[] = project.tracks.flatMap((track, lane) =>
    track.clips.map((clip) => {
      const take = project.takes[clip.takeId];
      const levels = take ? peaks[take.path] : undefined;
      return {
        start: clip.start,
        duration: clip.duration,
        lane,
        waveform: levels ? waveformPaths(levels, clip.offset, clip.duration) : null,
        peaksPerSecond: levels?.[0] ? peaksPerSecond(levels[0]) : 0,
      };
    }),
  );
  const trackNames = project.tracks.map((track) => track.name);

  const paints = makePaints(theme.colors);
  const font = matchFont({ fontFamily: FONT_FAMILY, fontSize: theme.typography.caption.fontSize });

  const zoom = useSharedValue(0);
  const scroll = useSharedValue(0);
  const crossScroll = useSharedValue(0);
  const follow = useSharedValue(true);
  const pinchStartZoom = useSharedValue(0);

  // Fit the zoom and scroll to the view: on first layout, rotation and when the idea grows.
  useEffect(() => {
    if (timeLength <= 0) return;
    const nextZoom =
      zoom.get() > 0
        ? clampZoom(zoom.get(), timeLength, duration)
        : defaultZoom(timeLength, duration);
    zoom.set(nextZoom);
    scroll.set(clampScroll(scroll.get(), timeLength, nextZoom, duration));
    crossScroll.set(clamp(crossScroll.get(), 0, maxCrossScroll));
  }, [timeLength, duration, maxCrossScroll, zoom, scroll, crossScroll]);

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
      const viewSeconds = timeLength / currentZoom;
      if (following) {
        if (follow.get()) scroll.set(followScroll(scroll.get(), position, viewSeconds));
        return;
      }
      const start = scroll.get();
      if (position === previous || (position >= start && position <= start + viewSeconds)) return;
      scroll.set(
        clampScroll(
          followScroll(start, position, viewSeconds),
          timeLength,
          currentZoom,
          Math.max(duration, position),
        ),
      );
    },
  );

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      cancelAnimation(scroll);
    },
    onUpdate: (event) => {
      'worklet';
      follow.set(false);
      const change = toAxes(orientation, event.changeX, event.changeY);
      const currentZoom = zoom.get();
      const extent = Math.max(duration, playhead.get());
      scroll.set(
        clampScroll(scroll.get() - change.time / currentZoom, timeLength, currentZoom, extent),
      );
      crossScroll.set(clamp(crossScroll.get() - change.cross, 0, maxCrossScroll));
    },
    onDeactivate: (event) => {
      'worklet';
      const velocity = toAxes(orientation, event.velocityX, event.velocityY);
      const currentZoom = zoom.get();
      const extent = Math.max(duration, playhead.get());
      scroll.set(
        withDecay({
          velocity: -velocity.time / currentZoom,
          clamp: [0, maxScroll(timeLength, currentZoom, extent)],
        }),
      );
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
      const nextZoom = clampZoom(pinchStartZoom.get() * event.scale, timeLength, extent);
      const focal = toAxes(orientation, event.focalX, event.focalY).time;
      const nextScroll = zoomAroundPoint(scroll.get(), zoom.get(), nextZoom, focal);
      zoom.set(nextZoom);
      scroll.set(clampScroll(nextScroll, timeLength, nextZoom, extent));
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (event) => {
      const point = toAxes(orientation, event.x, event.y);
      if (point.cross > rulerSize) return;
      const time = pointToTime(point.time, scroll.get(), zoom.get());
      onSeek(clamp(time, 0, contentDuration(duration)));
    },
  });

  const gesture = useSimultaneousGestures(pan, pinch, tap);

  const picture = useDerivedValue(() =>
    createPicture((canvas) => {
      const z = zoom.get();
      if (z <= 0) return;
      const s = scroll.get();
      const cs = crossScroll.get();
      const position = playhead.get();
      const laneStart = (index: number) => rulerSize + index * lane - cs;

      canvas.save();
      canvas.concat(matrix);

      // Lanes.
      for (let index = 0; index < trackCount; index++) {
        const c0 = laneStart(index);
        canvas.drawRect(
          Skia.XYWHRect(0, c0, timeLength, lane),
          index % 2 === 1 ? paints.laneAlt : paints.lane,
        );
        canvas.drawLine(0, c0 + lane, timeLength, c0 + lane, paints.separator);
      }

      // Clips and their waveforms.
      for (const clip of clips) {
        const t0 = (clip.start - s) * z;
        const length = clip.duration * z;
        if (t0 > timeLength || t0 + length < 0) continue;
        const c0 = laneStart(clip.lane) + CLIP_INSET;
        const height = lane - CLIP_INSET * 2;
        const rect = Skia.XYWHRect(t0, c0, length, height);
        canvas.drawRRect(Skia.RRectXY(rect, CLIP_RADIUS, CLIP_RADIUS), paints.clip);
        canvas.drawLine(t0, c0 + height / 2, t0 + length, c0 + height / 2, paints.centerLine);
        const path = clip.waveform
          ? clip.waveform[waveformLevel(clip.peaksPerSecond, z, LEVEL_COUNT, LEVEL_FACTOR)]
          : undefined;
        if (path) {
          canvas.save();
          canvas.clipRect(rect, ClipOp.Intersect, true);
          canvas.translate(t0, c0 + height / 2);
          canvas.scale(z, height / 2 - CLIP_INSET);
          canvas.drawPath(path, paints.waveform);
          canvas.restore();
        }
      }

      // The take being recorded (on the first track, T1/T2 behaviour).
      if (recordingStart != null && position > recordingStart) {
        const t0 = (recordingStart - s) * z;
        const rect = Skia.XYWHRect(
          t0,
          laneStart(0) + CLIP_INSET,
          (position - recordingStart) * z,
          lane - CLIP_INSET * 2,
        );
        canvas.drawRRect(Skia.RRectXY(rect, CLIP_RADIUS, CLIP_RADIUS), paints.recording);
      }

      // Ruler.
      const steps = rulerSteps(z);
      const visibleEnd = s + timeLength / z;
      canvas.drawRect(Skia.XYWHRect(0, 0, timeLength, rulerSize), paints.ruler);
      const firstTick = Math.floor(s / steps.tick);
      const lastTick = Math.ceil(visibleEnd / steps.tick);
      for (let index = firstTick; index <= lastTick; index++) {
        const time = index * steps.tick;
        const point = (time - s) * z;
        const isLabel = isMultiple(time, steps.label);
        canvas.drawLine(point, rulerSize - (isLabel ? 10 : 5), point, rulerSize, paints.tick);
      }
      canvas.drawLine(0, rulerSize, timeLength, rulerSize, paints.separator);

      canvas.restore();

      // Text, placed through the axis mapping but never transformed (it would be mirrored).
      const firstLabel = Math.floor(s / steps.label);
      const lastLabel = Math.ceil(visibleEnd / steps.label);
      for (let index = firstLabel; index <= lastLabel; index++) {
        const point = (index * steps.label - s) * z;
        const at =
          orientation === 'landscape'
            ? { x: point + 4, y: rulerSize - 10 }
            : { x: 4, y: point + 4 + font.getSize() };
        canvas.drawText(formatRulerTime(index * steps.label), at.x, at.y, paints.label, font);
      }
      trackNames.forEach((name, index) => {
        const at = fromAxes(orientation, CLIP_INSET + 6, laneStart(index) + CLIP_INSET + 4);
        canvas.drawText(
          name,
          at.x + (orientation === 'portrait' ? 6 : 0),
          at.y + font.getSize(),
          paints.trackName,
          font,
        );
      });

      // Playhead, on top of everything.
      const playheadPoint = (position - s) * z;
      canvas.save();
      canvas.concat(matrix);
      canvas.drawLine(playheadPoint, 0, playheadPoint, crossLength, paints.playhead);
      canvas.restore();
    }),
  );

  const clipCount = clips.length;
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.root}
        accessible
        accessibilityLabel={`Timeline, ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}, ${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSize({ width, height });
        }}>
        {size.width > 0 ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Picture picture={picture} />
          </Canvas>
        ) : null}
      </View>
    </GestureDetector>
  );
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
    centerLine: stroke(colors.waveform, StyleSheet.hairlineWidth),
    waveform: fill(colors.waveform),
    recording: fill(colors.primary, 0.3),
    ruler: fill(colors.surfaceMuted),
    tick: stroke(colors.textTertiary, 1),
    label: fill(colors.textSecondary),
    trackName: fill(colors.textSecondary),
    playhead: stroke(colors.primary, PLAYHEAD_WIDTH),
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
