import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  cutTrackAt,
  ensureRecordPermission,
  peakLevel,
  play,
  playbackAnchor,
  playbackPosition,
  setMetronome,
  setTrackGain,
  startRecording,
  stopPlayback,
  type ActiveRecording,
  type PlaybackAnchor,
  type PlayableClip,
  type RecordingPlayback,
} from '@/features/audio/audio-engine';
import {
  choosePunch,
  displayPosition,
  fileStartPosition,
  placeTake,
  runUpStart,
} from '@/features/audio/take-alignment';
import { discardRecordedFile, storeRecordedTake } from '@/features/audio/take-files';
import { preRollLength } from '@/features/audio/tempo';
import type { Project } from '@/features/projects/projects-repo';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';
import { prefetchTakePeaks } from '@/features/timeline/use-take-peaks';
import { createLivePeaks, LIVE_PEAKS_PER_SECOND } from '@/features/timeline/waveform-peaks';

import { recordTake, useEditorStore } from './editor-store';
import { hasSolo, trackOutputGain } from './mixer';
import { toUiClock } from './ui-clock';

export type TransportStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'playing';

/** The take being recorded, for drawing it live on the timeline. */
export type LiveTake = {
  /** Timeline position where the take starts (the punch point); drawn from there on. */
  start: number;
  trackId: string;
  /** Timeline position of the first of `peaks` (before `start` when the recorder ran in the run-up). */
  peaksStart: number;
  /** Interleaved `[min, max]` pairs at `peaksPerSecond`, appended as audio arrives. */
  peaks: SharedValue<number[]>;
  /** Loudest absolute sample so far (0…1). */
  peak: SharedValue<number>;
  peaksPerSecond: number;
};

const TICK_MS = 100;
/** How far ahead of the current playback position a punch has to be, so the cut can be scheduled. */
const PUNCH_LEAD_SECONDS = 0.03;

/**
 * Record / play state for the open project, and the playhead.
 *
 * - `playhead` (seconds) is a shared value animated on the UI thread every frame from an anchor
 *   (`{ from, startedAtMs }`, converted to the UI thread's `performance.now()` clock by
 *   `toUiClock`) while playing or recording; the
 *   React `position` state ticks at 10 Hz for the clock text only.
 *   The clock always shows the timeline position, recording included.
 * - Play starts at the playhead (from 0 if it's past the end). Pause leaves the playhead where it is;
 *   reaching the end returns it to where Play started. Back to start (`toStart`) jumps to 0:00 and
 *   keeps playing if playing, and always brings the start into view (`revealPlayhead`).
 * - Record records onto the given (armed) track from the playhead while the other tracks play; the
 *   saved clip is lined up with them (`take-alignment.ts`, plus the manual offset from Settings).
 *   Stop returns the playhead to where recording started. Leaving the screen while recording stops
 *   and saves the take.
 * - Punch in (`take-alignment.ts`): with the idea's pre-roll on, playback of every track (the armed
 *   one included) starts the pre-roll length before the playhead (silence before 0:00, where the
 *   playhead waits), the recorder starts with it, and at the punch point the armed track is cut and
 *   the take begins. Record while playing does the same with the playback already running, punching
 *   in as soon as the recorder has audio. Stop before the punch point saves nothing.
 * - Metronome (T17): the engine clicks along with playback and recording while the idea's toggle is
 *   on, following its tempo, meter and metronome volume live. The pre-roll's run-up clicks too, so
 *   it is the count-in; with the metronome on it is always whole bars, so the punch lands on a beat
 *   as counted.
 */
export function useTransport(project: Project | null | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TransportStatus>('idle');
  const [position, setPosition] = useState(0);
  const [level, setLevel] = useState(0);
  /** Recording, but still in the run-up before the punch point (judged before clamping at 0:00). */
  const [preRolling, setPreRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTake, setLiveTake] = useState<{
    start: number;
    peaksStart: number;
    trackId: string;
  } | null>(null);
  const playhead = useSharedValue(0);
  const anchor = useSharedValue<PlaybackAnchor | null>(null);
  const livePeaks = useSharedValue<number[]>([]);
  const livePeak = useSharedValue(0);
  /** Bumped to ask the timeline to bring the playhead into view even if it didn't move. */
  const revealPlayhead = useSharedValue(0);
  const recordingRef = useRef<{
    recording: ActiveRecording;
    takeId: string;
    projectId: string;
    trackId: string;
    /** Where playback started (the run-up start with pre-roll); the file is lined up from it. */
    playbackFrom: number;
    /** The take starts no earlier than this: the punch point, or 0 without punch-in. */
    floor: number;
    /** Where the take starts on screen and the playhead returns to after Stop. */
    punch: number;
  } | null>(null);

  const isRecording = status === 'recording';
  const isPlaying = status === 'playing';
  const isIdle = status === 'idle';

  // Playhead: advanced on the UI thread from the anchor, without React renders. It waits at 0:00
  // through a run-up that starts before it. Running whenever the transport isn't idle, so it keeps
  // moving while Record starts during playback.
  const frameCallback = useFrameCallback(() => {
    const current = anchor.get();
    if (!current) return;
    const time = current.from + Math.max(0, performance.now() - current.startedAtMs) / 1000;
    playhead.set(Math.max(0, time));
  }, false);
  useEffect(() => {
    frameCallback.setActive(!isIdle);
  }, [frameCallback, isIdle]);

  // Clock text: the timeline position while playing or recording (like the playhead).
  useEffect(() => {
    if (!isRecording && !isPlaying) return;
    const timer = setInterval(() => {
      if (isPlaying) {
        setPosition(playbackPosition() ?? 0);
        return;
      }
      const active = recordingRef.current;
      if (active) {
        const time = anchorPosition(active.recording.anchor);
        setPosition(displayPosition(time));
        setPreRolling(time < active.punch);
      }
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

  // Metronome: on/off, tempo, meter and volume reach the engine live (also mid-playback).
  const metronomeOn = useEditorStore((state) => state.metronome);
  const bpm = project?.bpm;
  const beatsPerBar = project?.beatsPerBar;
  const beatUnit = project?.beatUnit;
  const metronomeVolume = project?.metronomeVolume;
  useEffect(() => {
    setMetronome(
      metronomeOn && bpm && beatsPerBar && beatUnit && metronomeVolume !== undefined
        ? { meter: { bpm, beatsPerBar, beatUnit }, volume: metronomeVolume }
        : null,
    );
  }, [metronomeOn, bpm, beatsPerBar, beatUnit, metronomeVolume]);
  useEffect(() => () => setMetronome(null), []);

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
    const { latencyOffsetMs } = useRecordingSettingsStore.getState();
    const placement = placeTake({
      fileStart: fileStartPosition(active.playbackFrom, recorded.alignment, latencyOffsetMs / 1000),
      floor: active.floor,
      takeDuration: recorded.duration,
    });
    // Stopped before the punch point: no take.
    if (!placement) {
      discardRecordedFile(recorded.path);
      return;
    }
    const path = storeRecordedTake(recorded.path, active.projectId, active.takeId);
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

  /**
   * Records onto `trackId` from the playhead while the other tracks play; with pre-roll on, after a
   * run-up. While playing, punches in on the fly.
   */
  const record = async (trackId: string) => {
    if (!project || (status !== 'idle' && status !== 'playing')) return;
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    const onTheFly = status === 'playing';
    const { preRoll, metronome } = useEditorStore.getState();
    const punchIn = onTheFly || preRoll;
    setError(null);
    setStatus('starting');
    try {
      if (!(await ensureRecordPermission())) {
        setError('Microphone access is off. Allow it in the Settings app to record.');
        setStatus(onTheFly ? 'playing' : 'idle');
        return;
      }
      const takeId = randomUUID();
      const requested = onTheFly
        ? (playbackPosition() ?? playhead.get())
        : Math.max(0, playhead.get());
      const { preRollSeconds, preRollBars } = useRecordingSettingsStore.getState();
      // Whole bars with the grid or the metronome on (so the punch lands on the beat as counted),
      // seconds otherwise.
      const runUp = preRollLength(
        { grid: project.grid || metronome, meter: project },
        { seconds: preRollSeconds, bars: preRollBars },
      );
      const playback: RecordingPlayback = onTheFly
        ? { continueFrom: requested }
        : preRoll
          ? { clips: playableClips(project), from: runUpStart(requested, runUp) }
          : { clips: playableClips(project, (other) => other.id !== track.id), from: requested };
      const peaks = createLivePeaks(LIVE_PEAKS_PER_SECOND);
      let loudest = 0;
      livePeaks.set([]);
      livePeak.set(0);
      const recording = await startRecording({
        fileName: takeId,
        playback,
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
      const playbackFrom = recording.anchor.from;
      let punch = requested;
      let peaksStart = requested;
      if (punchIn) {
        // Punch where requested, unless the file doesn't reach back that far (a recorder that
        // started late, or on the fly); the armed track goes silent exactly there.
        const { latencyOffsetMs } = useRecordingSettingsStore.getState();
        const alignment = await recording.whenStarted();
        peaksStart = fileStartPosition(playbackFrom, alignment, latencyOffsetMs / 1000);
        const now = playbackPosition() ?? anchorPosition(recording.anchor);
        punch = choosePunch(requested, peaksStart, now, PUNCH_LEAD_SECONDS);
        cutTrackAt(track.id, punch);
      }
      recordingRef.current = {
        recording,
        takeId,
        projectId: project.id,
        trackId: track.id,
        playbackFrom,
        floor: punchIn ? punch : 0,
        punch,
      };
      if (!onTheFly) {
        playhead.set(displayPosition(playbackFrom));
        setPosition(displayPosition(playbackFrom));
      }
      anchor.set(toUiClock(recording.anchor));
      setPreRolling(anchorPosition(recording.anchor) < punch);
      setLiveTake({ start: punch, peaksStart, trackId: track.id });
      setStatus('recording');
    } catch (cause) {
      setError(messageOf(cause, 'Recording could not start.'));
      if (onTheFly) stopPlaying();
      setStatus('idle');
    }
  };

  const stopRecording = async () => {
    const from = recordingRef.current?.punch ?? 0;
    setStatus('stopping');
    try {
      await finishRecording();
    } catch (cause) {
      setError(messageOf(cause, 'The recording could not be saved.'));
    }
    // Back to the punch point, so Play plays the new take with the others.
    moveTo(from);
    setLiveTake(null);
    setPreRolling(false);
    livePeaks.set([]);
    setLevel(0);
    setStatus('idle');
  };

  const playFrom = async (requested: number, source: Project | null | undefined = project) => {
    if (!source) return;
    setError(null);
    const from = requested < source.duration ? requested : 0;
    const clips = playableClips(source);
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

  /** Stop playback, leaving the playhead where it is (or at `at`, e.g. 0 for back to start). */
  const stopPlaying = (at?: number) => {
    const stoppedAt = at ?? playbackPosition() ?? playhead.get();
    stopPlayback();
    moveTo(stoppedAt);
    setStatus('idle');
  };

  /**
   * Clips were edited while playing (moved, trimmed, split…): continue from where playback is, with
   * the edited clips. Volume, mute and solo don't need this (the mixer effect applies them live).
   */
  const replay = () => {
    if (status !== 'playing') return;
    const at = playbackPosition() ?? playhead.get();
    stopPlayback();
    void playFrom(at, useEditorStore.getState().project);
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

  /** Back to start: 0:00, still playing if it was, with the start brought into view. */
  const toStart = () => {
    if (status !== 'idle' && status !== 'playing') return;
    seek(0);
    revealPlayhead.set(revealPlayhead.get() + 1);
  };

  return {
    status,
    position,
    /** While recording: the take hasn't started yet (the run-up before the punch point). */
    isPreRolling: isRecording && preRolling,
    level,
    error,
    playhead,
    revealPlayhead,
    liveTake: liveTake
      ? { ...liveTake, peaks: livePeaks, peak: livePeak, peaksPerSecond: LIVE_PEAKS_PER_SECOND }
      : null,
    record,
    stopRecording,
    startPlayback,
    stopPlaying,
    seek,
    toStart,
    replay,
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

/** The timeline position an anchor's playback has reached now. */
function anchorPosition(anchor: PlaybackAnchor): number {
  return anchor.from + Math.max(0, performance.now() - anchor.startedAtMs) / 1000;
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? `${fallback} (${cause.message})` : fallback;
}
