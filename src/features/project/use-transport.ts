import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';

import {
  ensureRecordPermission,
  play,
  playbackPosition,
  startRecording,
  stopPlayback,
  type ActiveRecording,
  type PlayableClip,
} from '@/features/audio/audio-engine';
import { storeRecordedTake } from '@/features/audio/take-files';
import type { Project } from '@/features/projects/projects-repo';
import { useAddTake } from '@/features/projects/queries';

export type TransportStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'playing';

const TICK_MS = 100;

/**
 * Record / play state for the open project. T1 records onto the first track, appending each take
 * after the previous one. Leaving the screen while recording stops and saves the take.
 */
export function useTransport(project: Project | null | undefined) {
  const addTake = useAddTake();
  const [status, setStatus] = useState<TransportStatus>('idle');
  const [position, setPosition] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<{
    recording: ActiveRecording;
    takeId: string;
    projectId: string;
    trackId: string;
    start: number;
  } | null>(null);

  const isRecording = status === 'recording';
  const isPlaying = status === 'playing';

  // Clock: elapsed time while recording, timeline position while playing.
  useEffect(() => {
    if (!isRecording && !isPlaying) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setPosition(isPlaying ? (playbackPosition() ?? 0) : (Date.now() - startedAt) / 1000);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [isRecording, isPlaying]);

  const finishRecording = async () => {
    const active = recordingRef.current;
    if (!active) return;
    recordingRef.current = null;
    const recorded = await active.recording.stop();
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
      const recording = await startRecording({ fileName: takeId, onLevel: setLevel });
      recordingRef.current = {
        recording,
        takeId,
        projectId: project.id,
        trackId: track.id,
        start: lastClip ? lastClip.start + lastClip.duration : 0,
      };
      setPosition(0);
      setStatus('recording');
    } catch (cause) {
      setError(messageOf(cause, 'Recording could not start.'));
      setStatus('idle');
    }
  };

  const stopRecording = async () => {
    setStatus('stopping');
    try {
      await finishRecording();
    } catch (cause) {
      setError(messageOf(cause, 'The recording could not be saved.'));
    }
    setLevel(0);
    setStatus('idle');
  };

  const startPlayback = async () => {
    if (!project || status !== 'idle') return;
    setError(null);
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
      setPosition(0);
      setStatus('playing');
      await play(clips, {
        onEnded: () => {
          setStatus('idle');
          setPosition(0);
        },
      });
    } catch (cause) {
      setError(messageOf(cause, 'Playback failed.'));
      setStatus('idle');
    }
  };

  const stopPlaying = () => {
    stopPlayback();
    setStatus('idle');
    setPosition(0);
  };

  return { status, position, level, error, record, stopRecording, startPlayback, stopPlaying };
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? `${fallback} (${cause.message})` : fallback;
}
