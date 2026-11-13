/**
 * The editor's commands as pure functions: each turns the open project and an input into an `Edit`
 * (`edit-changes.ts`), or `null` when there's nothing to do. The store applies, saves and records them.
 */
import { randomUUID } from 'expo-crypto';

import { clearRange } from '@/features/projects/clip-overlap';
import type { Clip, Project, Take, Track } from '@/features/projects/projects-repo';

import { trackRow, type Change, type Edit } from './edit-changes';

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

  const changes: Change[] = [];
  for (const edit of clearRange(track.clips, start, start + duration)) {
    const clip = track.clips.find((candidate) => candidate.id === edit.id);
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

  const clipId = randomUUID();
  changes.push({
    table: 'clips',
    id: clipId,
    before: null,
    after: { id: clipId, trackId: track.id, takeId: input.take.id, start, offset, duration },
  });
  return { label: 'Record', changes };
}
