/**
 * The editor's commands as pure functions: each turns the open project and an input into an `Edit`
 * (`edit-changes.ts`), or `null` when there's nothing to do. The store applies, saves and records them.
 */
import { randomUUID } from 'expo-crypto';

import { clampBpm } from '@/features/audio/tempo';
import { clearRange } from '@/features/projects/clip-overlap';
import type { Clip, IdeaSettings, Project, Take, Track } from '@/features/projects/projects-repo';
import { moveIndex } from '@/features/timeline/reorder-math';

import { ideaSettings, trackRow, type Change, type Edit } from './edit-changes';

/** Adds an empty track after the last one, named "Track N". */
export function addTrackEdit(project: Project): { edit: Edit; trackId: string } {
  const position = Math.max(-1, ...project.tracks.map((track) => track.position)) + 1;
  const trackId = randomUUID();
  return {
    trackId,
    edit: {
      label: 'Add track',
      changes: [
        {
          table: 'tracks',
          id: trackId,
          before: null,
          after: {
            id: trackId,
            projectId: project.id,
            position,
            name: `Track ${position + 1}`,
            volume: 1,
            muted: false,
            solo: false,
          },
        },
      ],
    },
  };
}

/** Renames a track; an empty or unchanged name does nothing. */
export function renameTrackEdit(project: Project, trackId: string, name: string): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  const trimmed = name.trim();
  if (!track || !trimmed || trimmed === track.name) return null;
  const before = trackRow(track);
  return {
    label: 'Rename track',
    changes: [{ table: 'tracks', id: trackId, before, after: { ...before, name: trimmed } }],
  };
}

/**
 * Moves a track to index `toIndex` in the track order (the others close up behind it). The tracks keep
 * the position values they already have, handed out again in the new order, so the highest position
 * (and `addTrackEdit`'s "Track N" naming) doesn't change. Only tracks whose position changes are in
 * the edit. `null` for a missing track or when it's already at `toIndex`.
 */
export function moveTrackEdit(project: Project, trackId: string, toIndex: number): Edit | null {
  const from = project.tracks.findIndex((track) => track.id === trackId);
  const to = Math.min(Math.max(0, Math.round(toIndex)), project.tracks.length - 1);
  if (from < 0 || from === to) return null;
  const positions = project.tracks.map((track) => track.position).sort((a, b) => a - b);
  const changes: Change[] = [];
  moveIndex(project.tracks, from, to).forEach((track, index) => {
    const position = positions[index] as number;
    if (track.position === position) return;
    const before = trackRow(track);
    changes.push({ table: 'tracks', id: track.id, before, after: { ...before, position } });
  });
  return { label: 'Move track', changes };
}

/** Sets a track's volume (linear gain, 1 = 0 dB); an unchanged or invalid volume does nothing. */
export function setTrackVolumeEdit(project: Project, trackId: string, volume: number): Edit | null {
  if (!Number.isFinite(volume) || volume < 0) return null;
  return trackSettingEdit(project, trackId, { volume }, 'Track volume');
}

export function setTrackMutedEdit(project: Project, trackId: string, muted: boolean): Edit | null {
  return trackSettingEdit(project, trackId, { muted }, muted ? 'Mute' : 'Unmute');
}

export function setTrackSoloEdit(project: Project, trackId: string, solo: boolean): Edit | null {
  return trackSettingEdit(project, trackId, { solo }, solo ? 'Solo' : 'Unsolo');
}

/** Changes mixer settings of a track's row; `null` when the track is missing or nothing changes. */
function trackSettingEdit(
  project: Project,
  trackId: string,
  settings: Partial<Pick<Track, 'volume' | 'muted' | 'solo'>>,
  label: string,
): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return null;
  const before = trackRow(track);
  const after = { ...before, ...settings };
  if (
    after.volume === before.volume &&
    after.muted === before.muted &&
    after.solo === before.solo
  ) {
    return null;
  }
  return { label, changes: [{ table: 'tracks', id: trackId, before, after }] };
}

/**
 * Deletes a track with its clips (listed one by one, so undo puts them back). Their takes stay. An
 * idea always keeps at least one track, so deleting the last one does nothing.
 */
export function deleteTrackEdit(project: Project, trackId: string): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track || project.tracks.length <= 1) return null;
  return {
    label: 'Delete track',
    changes: [
      ...track.clips.map((clip): Change => ({
        table: 'clips',
        id: clip.id,
        before: clip,
        after: null,
      })),
      { table: 'tracks', id: trackId, before: trackRow(track), after: null },
    ],
  };
}

export type RecordedTakeInput = {
  trackId: string;
  take: Pick<Take, 'id' | 'duration'>;
  /** Timeline position of the clip. */
  start: number;
  /** Seconds skipped at the take's start (default 0). */
  offset?: number;
};

/**
 * Places a recorded take on a track as one clip from `offset` to the take's end. The new clip replaces
 * whatever was under it on that track: overlapped clips are trimmed or split (`clip-overlap.ts`).
 * `null` if the track doesn't exist.
 */
export function recordTakeEdit(project: Project, input: RecordedTakeInput): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === input.trackId);
  if (!track) return null;
  const offset = Math.min(Math.max(0, input.offset ?? 0), input.take.duration);
  const start = Math.max(0, input.start);
  const duration = input.take.duration - offset;

  const changes = clearRangeChanges(track.clips, start, start + duration);
  const clipId = randomUUID();
  changes.push({
    table: 'clips',
    id: clipId,
    before: null,
    after: { id: clipId, trackId: track.id, takeId: input.take.id, start, offset, duration },
  });
  return { label: 'Record', changes };
}

/**
 * The changes that clear `from…to` on a track holding `clips`: overlapped clips are trimmed, split or
 * deleted (`clip-overlap.ts`). Leave out the clip being placed.
 */
function clearRangeChanges(clips: Clip[], from: number, to: number): Change[] {
  const changes: Change[] = [];
  for (const edit of clearRange(clips, from, to)) {
    const clip = clips.find((candidate) => candidate.id === edit.id);
    if (!clip) continue;
    if (edit.kind === 'delete') {
      changes.push({ table: 'clips', id: clip.id, before: clip, after: null });
    } else if (edit.kind === 'update') {
      const after: Clip = {
        ...clip,
        start: edit.start,
        offset: edit.offset,
        duration: edit.duration,
      };
      changes.push({ table: 'clips', id: clip.id, before: clip, after });
    } else {
      const tailId = randomUUID();
      changes.push(
        { table: 'clips', id: clip.id, before: clip, after: { ...clip, duration: edit.duration } },
        { table: 'clips', id: tailId, before: null, after: { ...clip, id: tailId, ...edit.tail } },
      );
    }
  }
  return changes;
}

/** Shortest clip a trim or split leaves (seconds). */
export const MIN_CLIP_SECONDS = 0.05;

/** A clip's place on the timeline: its track and its window onto its take. */
export type ClipPlacement = Pick<Clip, 'trackId' | 'start' | 'offset' | 'duration'>;

function findClip(project: Project, clipId: string): Clip | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

/**
 * Moves and/or trims a clip (a drag of the clip or of one of its handles): it gets `placement`, kept
 * within its take (a head before the take's start is cut back to it, a tail ends by the take's end), at least `MIN_CLIP_SECONDS` long and not
 * before 0:00. Whatever it lands on on its (new) track is replaced, as recording does. `null` for a
 * missing clip or track, or when nothing changes.
 */
export function placeClipEdit(
  project: Project,
  clipId: string,
  placement: ClipPlacement,
  label = 'Move clip',
): Edit | null {
  const clip = findClip(project, clipId);
  const track = project.tracks.find((candidate) => candidate.id === placement.trackId);
  if (!clip || !track) return null;
  const takeDuration = project.takes[clip.takeId]?.duration ?? Infinity;
  // A head reaching before the take's start is cut back to it, keeping the audio where it was.
  const before = Math.max(0, -placement.offset);
  const offset = Math.min(placement.offset + before, Math.max(0, takeDuration - MIN_CLIP_SECONDS));
  const duration = Math.min(
    Math.max(MIN_CLIP_SECONDS, placement.duration - before),
    takeDuration - offset,
  );
  const start = Math.max(0, placement.start + before);
  const after: Clip = { ...clip, trackId: track.id, start, offset, duration };
  if (
    after.trackId === clip.trackId &&
    after.start === clip.start &&
    after.offset === clip.offset &&
    after.duration === clip.duration
  ) {
    return null;
  }
  const others = track.clips.filter((candidate) => candidate.id !== clipId);
  return {
    label,
    changes: [
      ...clearRangeChanges(others, start, start + duration),
      { table: 'clips', id: clipId, before: clip, after },
    ],
  };
}

/**
 * Splits a clip at timeline position `at` into two clips on the same take: the original keeps the
 * head, a new clip the tail. `null` unless both pieces would be at least `MIN_CLIP_SECONDS` long.
 */
export function splitClipEdit(
  project: Project,
  clipId: string,
  at: number,
): { edit: Edit; tailId: string } | null {
  const clip = findClip(project, clipId);
  if (!clip || !canSplitAt(clip, at)) return null;
  const head = at - clip.start;
  const tailId = randomUUID();
  const tail: Clip = {
    ...clip,
    id: tailId,
    start: at,
    offset: clip.offset + head,
    duration: clip.duration - head,
  };
  return {
    tailId,
    edit: {
      label: 'Split clip',
      changes: [
        { table: 'clips', id: clipId, before: clip, after: { ...clip, duration: head } },
        { table: 'clips', id: tailId, before: null, after: tail },
      ],
    },
  };
}

/** Whether splitting `clip` at `at` leaves two pieces of at least `MIN_CLIP_SECONDS`. */
export function canSplitAt(clip: Pick<Clip, 'start' | 'duration'>, at: number): boolean {
  'worklet';
  return at - clip.start >= MIN_CLIP_SECONDS && clip.start + clip.duration - at >= MIN_CLIP_SECONDS;
}

/** Copies a clip to right after itself on the same track (replacing what's there). */
export function duplicateClipEdit(
  project: Project,
  clipId: string,
): { edit: Edit; copyId: string } | null {
  const clip = findClip(project, clipId);
  const track = project.tracks.find((candidate) => candidate.id === clip?.trackId);
  if (!clip || !track) return null;
  const copyId = randomUUID();
  const start = clip.start + clip.duration;
  const copy: Clip = { ...clip, id: copyId, start };
  const others = track.clips.filter((candidate) => candidate.id !== clipId);
  return {
    copyId,
    edit: {
      label: 'Duplicate clip',
      changes: [
        ...clearRangeChanges(others, start, start + clip.duration),
        { table: 'clips', id: copyId, before: null, after: copy },
      ],
    },
  };
}

/** Deletes a clip (its take stays until the idea is next opened without it in use). */
export function deleteClipEdit(project: Project, clipId: string): Edit | null {
  const clip = findClip(project, clipId);
  if (!clip) return null;
  return {
    label: 'Delete clip',
    changes: [{ table: 'clips', id: clipId, before: clip, after: null }],
  };
}

/**
 * Changes the idea's name, tempo, time signature, grid and/or metronome volume in one step. A blank name is ignored and the
 * tempo is clamped; setting a tempo that differs from the current one turns the grid on, unless the same
 * patch says otherwise. `null` when nothing would change.
 */
export function setIdeaSettingsEdit(project: Project, patch: Partial<IdeaSettings>): Edit | null {
  const before = ideaSettings(project);
  const after = { ...before };
  const name = patch.name?.trim();
  if (name) after.name = name;
  if (patch.bpm !== undefined) {
    after.bpm = clampBpm(patch.bpm);
    if (after.bpm !== before.bpm) after.grid = true;
  }
  if (patch.beatsPerBar !== undefined) after.beatsPerBar = patch.beatsPerBar;
  if (patch.beatUnit !== undefined) after.beatUnit = patch.beatUnit;
  if (patch.grid !== undefined) after.grid = patch.grid;
  if (patch.metronomeVolume !== undefined && Number.isFinite(patch.metronomeVolume)) {
    after.metronomeVolume = Math.max(0, patch.metronomeVolume);
  }
  if (
    after.name === before.name &&
    after.bpm === before.bpm &&
    after.beatsPerBar === before.beatsPerBar &&
    after.beatUnit === before.beatUnit &&
    after.grid === before.grid &&
    after.metronomeVolume === before.metronomeVolume
  ) {
    return null;
  }
  return {
    label: 'Idea settings',
    changes: [{ table: 'projects', id: project.id, before, after }],
  };
}
