import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import {
  ensureRecordPermission,
  play,
  playbackAnchor,
  playbackPosition,
  startRecording,
  stopPlayback,
  type ActiveRecording,
  type PlaybackAnchor,
  type PlayableClip,
} from '@/features/audio/audio-engine';
import { storeRecordedTake } from '@/features/audio/take-files';
import type { Project } from '@/features/projects/projects-repo';
import { useAddTake } from '@/features/projects/queries';
import { prefetchTakePeaks } from '@/features/timeline/use-take-peaks';

export type TransportStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'playing';

const TICK_MS = 100;

/**
 * Record / play state for the open project, and the playhead.
 *
 * - `playhead` (seconds) is a shared value animated on the UI thread every frame from an anchor
 *   (`{ from, startedAtMs }` on the `performance.now()` clock) while playing or recording; the
 *   React `position` state ticks at 10 Hz for the clock text only.
 * - Play starts at the playhead (from 0 if it's past the end). Stop leaves the playhead where it is;
 *   reaching the end returns it to where Play started.
 * - Recording still appends each take after the last clip on the first track (T3: at the playhead).
 *   Leaving the screen while recording stops and saves the take.
 */
export function useTransport(project: Project | null | undefined) {
  const addTake = useAddTake();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TransportStatus>('idle');
  const [position, setPosition] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordingStart, setRecordingStart] = useState<number | null>(null);
  const playhead = useSharedValue(0);
  const anchor = useSharedValue<PlaybackAnchor | null>(null);
  const recordingRef = useRef<{
    recording: ActiveRecording;
    takeId: string;
    projectId: string;
    trackId: string;
    start: number;
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
    await addTake.mutateAsync({
      projectId: active.projectId,
      trackId: active.trackId,
      start: active.start,
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

  const record = async () => {
    const track = project?.tracks[0];
    if (!project || !track || status !== 'idle') return;
    setError(null);
    setStatus('starting');
    try {
      if (!(await ensureRecordPermission())) {
        setError('Microphone access is off. Allow it in the Settings app to record.');
        setStatus('idle');
        return;
      }
      const takeId = randomUUID();
      const lastClip = track.clips.at(-1);
      const start = lastClip ? lastClip.start + lastClip.duration : 0;
      const recording = await startRecording({ fileName: takeId, onLevel: setLevel });
      recordingRef.current = { recording, takeId, projectId: project.id, trackId: track.id, start };
      playhead.set(start);
      anchor.set({ from: start, startedAtMs: performance.now() });
      setRecordingStart(start);
      setPosition(0);
      setStatus('recording');
    } catch (cause) {
      setError(messageOf(cause, 'Recording could not start.'));
      setStatus('idle');
    }
  };

  const stopRecording = async () => {
    const start = recordingRef.current?.start ?? 0;
    setStatus('stopping');
    try {
      await finishRecording();
    } catch (cause) {
      setError(messageOf(cause, 'The recording could not be saved.'));
    }
    // Back to the start of the new take, so Play plays it.
    moveTo(start);
    setRecordingStart(null);
    setLevel(0);
    setStatus('idle');
  };

  const playFrom = async (requested: number) => {
    if (!project) return;
    setError(null);
    const from = requested < project.duration ? requested : 0;
    const clips: PlayableClip[] = project.tracks.flatMap((track) =>
      track.clips.flatMap((clip) => {
        const take = project.takes[clip.takeId];
        return take
          ? [
              {
                takePath: take.path,
                start: clip.start,
                offset: clip.offset,
                duration: clip.duration,
                volume: track.volume,
              },
            ]
          : [];
      }),
    );
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
      anchor.set(playbackAnchor());
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
    recordingStart,
    record,
    stopRecording,
    startPlayback,
    stopPlaying,
    seek,
  };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? `${fallback} (${cause.message})` : fallback;
}
