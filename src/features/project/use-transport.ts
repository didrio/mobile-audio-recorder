import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  ensureRecordPermission,
  peakLevel,
  play,
  playbackAnchor,
  playbackPosition,
  setTrackGain,
  startRecording,
  stopPlayback,
  type ActiveRecording,
  type PlaybackAnchor,
  type PlayableClip,
} from '@/features/audio/audio-engine';
import { placeTake } from '@/features/audio/take-alignment';
import { storeRecordedTake } from '@/features/audio/take-files';
import type { Project } from '@/features/projects/projects-repo';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import { prefetchTakePeaks } from '@/features/timeline/use-take-peaks';
import { createLivePeaks, LIVE_PEAKS_PER_SECOND } from '@/features/timeline/waveform-peaks';

import { recordTake } from './editor-store';
import { hasSolo, trackOutputGain } from './mixer';
import { toUiClock } from './ui-clock';

export type TransportStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'playing';

/** The take being recorded, for drawing it live on the timeline. */
export type LiveTake = {
  /** Timeline position where recording started. */
  start: number;
  trackId: string;
  /** Interleaved `[min, max]` pairs at `peaksPerSecond`, appended as audio arrives. */
  peaks: SharedValue<number[]>;
  /** Loudest absolute sample so far (0…1). */
  peak: SharedValue<number>;
  peaksPerSecond: number;
};

const TICK_MS = 100;

/**
 * Record / play state for the open project, and the playhead.
 *
 * - `playhead` (seconds) is a shared value animated on the UI thread every frame from an anchor
 *   (`{ from, startedAtMs }`, converted to the UI thread's `performance.now()` clock by
 *   `toUiClock`) while playing or recording; the
 *   React `position` state ticks at 10 Hz for the clock text only.
 * - Play starts at the playhead (from 0 if it's past the end). Stop leaves the playhead where it is;
 *   reaching the end returns it to where Play started.
 * - Record records onto the given (armed) track from the playhead while the other tracks play; the
 *   saved clip is lined up with them (`take-alignment.ts`, plus the manual offset from Settings).
 *   Stop returns the playhead to where recording started. Leaving the screen while recording stops
 *   and saves the take.
 */
export function useTransport(project: Project | null | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TransportStatus>('idle');
  const [position, setPosition] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveTake, setLiveTake] = useState<{ start: number; trackId: string } | null>(null);
  const playhead = useSharedValue(0);
  const anchor = useSharedValue<PlaybackAnchor | null>(null);
  const livePeaks = useSharedValue<number[]>([]);
  const livePeak = useSharedValue(0);
  const recordingRef = useRef<{
    recording: ActiveRecording;
    takeId: string;
    projectId: string;
    trackId: string;
    from: number;
  } | null>(null);

  const isRecording = status === 'recording';
  const isPlaying = status === 'playing';

  // Playhead: advanced on the UI thread from the anchor, without React renders.
  const frameCallback = useFrameCallback(() => {
    const current = anchor.get();
    if (!current) return;
    playhead.set(current.from + Math.max(0, performance.now() - current.startedAtMs) / 1000);
  }, false);
  useEffect(() => {
    frameCallback.setActive(isPlaying || isRecording);
  }, [frameCallback, isPlaying, isRecording]);

  // Clock text: elapsed time while recording, timeline position while playing.
  useEffect(() => {
    if (!isRecording && !isPlaying) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setPosition(isPlaying ? (playbackPosition() ?? 0) : (Date.now() - startedAt) / 1000);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [isRecording, isPlaying]);

  // Mixer: the engine plays every track at its saved volume, mute and solo, and picks up changes
  // (a slider's final value, mute, solo, undo) live while playing or recording.
  const tracks = project?.tracks;
  useEffect(() => {
    const anySolo = hasSolo(tracks ?? []);
    for (const track of tracks ?? []) setTrackGain(track.id, trackOutputGain(track, anySolo));
  }, [tracks]);

  const moveTo = (time: number) => {
    anchor.set(null);
    playhead.set(time);
    setPosition(time);
  };

  const finishRecording = async () => {
    const active = recordingRef.current;
    if (!active) return;
    recordingRef.current = null;
    const recorded = await active.recording.stop();
    anchor.set(null);
    const path = storeRecordedTake(recorded.path, active.projectId, active.takeId);
    const { latencyOffsetMs } = useRecordingSettingsStore.getState();
    const placement = placeTake(active.from, recorded.alignment, latencyOffsetMs / 1000);
    await recordTake({
      projectId: active.projectId,
      trackId: active.trackId,
      start: placement.start,
      offset: placement.offset,
      take: {
        id: active.takeId,
        path,
        duration: recorded.duration,
        sampleRate: recorded.sampleRate,
        channels: recorded.channels,
      },
    });
    // Waveform for the new take; failures surface later as a clip without a waveform.
    void prefetchTakePeaks(queryClient, path).catch(() => {});
  };

  // Leaving the screen stops playback, and stops + saves a recording in progress.
  const finishRecordingRef = useRef(finishRecording);
  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  });
  useEffect(
    () => () => {
      stopPlayback();
      void finishRecordingRef.current();
    },
    [],
  );

  /** Records onto `trackId` from the playhead while the other tracks play. */
  const record = async (trackId: string) => {
    if (!project || status !== 'idle') return;
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    setError(null);
    setStatus('starting');
    try {
      if (!(await ensureRecordPermission())) {
        setError('Microphone access is off. Allow it in the Settings app to record.');
        setStatus('idle');
        return;
      }
      const takeId = randomUUID();
      const from = Math.max(0, playhead.get());
      const backing = playableClips(project, (other) => other.id !== track.id);
      const peaks = createLivePeaks(LIVE_PEAKS_PER_SECOND);
      let loudest = 0;
      livePeaks.set([]);
      livePeak.set(0);
      const recording = await startRecording({
        fileName: takeId,
        from,
        backing,
        onBuffer: (samples, sampleRate) => {
          setLevel(peakLevel(samples));
          const pairs = peaks.push(samples, sampleRate);
          if (pairs.length === 0) return;
          const before = loudest;
          for (const value of pairs) loudest = Math.max(loudest, Math.abs(value));
          if (loudest > before) livePeak.set(loudest);
          livePeaks.modify((value) => {
            'worklet';
            value.push(...pairs);
            return value;
          });
        },
      });
      recordingRef.current = { recording, takeId, projectId: project.id, trackId: track.id, from };
      playhead.set(from);
      anchor.set(toUiClock(recording.anchor));
      setLiveTake({ start: from, trackId: track.id });
      setPosition(0);
      setStatus('recording');
    } catch (cause) {
      setError(messageOf(cause, 'Recording could not start.'));
      setStatus('idle');
    }
  };

  const stopRecording = async () => {
    const from = recordingRef.current?.from ?? 0;
    setStatus('stopping');
    try {
      await finishRecording();
    } catch (cause) {
      setError(messageOf(cause, 'The recording could not be saved.'));
    }
    // Back to where recording started, so Play plays the new take with the others.
    moveTo(from);
    setLiveTake(null);
    livePeaks.set([]);
    setLevel(0);
    setStatus('idle');
  };

  const playFrom = async (requested: number) => {
    if (!project) return;
    setError(null);
    const from = requested < project.duration ? requested : 0;
    const clips = playableClips(project);
    try {
      moveTo(from);
      setStatus('playing');
      await play(clips, {
        from,
        onEnded: () => {
          moveTo(from);
          setStatus('idle');
        },
      });
      const started = playbackAnchor();
      anchor.set(started ? toUiClock(started) : null);
    } catch (cause) {
      moveTo(from);
      setError(messageOf(cause, 'Playback failed.'));
      setStatus('idle');
    }
  };

  const startPlayback = async () => {
    if (status !== 'idle') return;
    await playFrom(playhead.get());
  };

  const stopPlaying = () => {
    const stoppedAt = playbackPosition() ?? playhead.get();
    stopPlayback();
    moveTo(stoppedAt);
    setStatus('idle');
  };

  /** Move the playhead; while playing, playback continues from there. Ignored while recording. */
  const seek = (time: number) => {
    if (status === 'idle') {
      moveTo(time);
    } else if (status === 'playing') {
      stopPlayback();
      void playFrom(time);
    }
  };

  return {
    status,
    position,
    level,
    error,
    playhead,
    liveTake: liveTake
      ? { ...liveTake, peaks: livePeaks, peak: livePeak, peaksPerSecond: LIVE_PEAKS_PER_SECOND }
      : null,
    record,
    stopRecording,
    startPlayback,
    stopPlaying,
    seek,
  };
}

/** The project's clips as the engine plays them, from the tracks that pass `include`. */
function playableClips(
  project: Project,
  include: (track: Project['tracks'][number]) => boolean = () => true,
): PlayableClip[] {
  return project.tracks.filter(include).flatMap((track) =>
    track.clips.flatMap((clip) => {
      const take = project.takes[clip.takeId];
      return take
        ? [
            {
              takePath: take.path,
              trackId: track.id,
              start: clip.start,
              offset: clip.offset,
              duration: clip.duration,
            },
          ]
        : [];
    }),
  );
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? `${fallback} (${cause.message})` : fallback;
}
