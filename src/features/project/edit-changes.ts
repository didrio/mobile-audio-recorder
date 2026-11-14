/**
 * Edits to the open idea, as snapshots of the rows they touch.
 *
 * Every change says what a row looked like before and after (`null` = the row doesn't exist). That one
 * shape covers inserts, updates and deletes, and makes undo generic: the inverse of an edit swaps
 * `before` and `after`. The same edit is applied to the in-memory project (`applyToProject`) and
 * written to SQLite (`saveChanges` in `projects-repo.ts`).
 *
 * Takes are not part of edits: they're append-only while an idea is open, and the ones no clip uses are
 * deleted the next time it opens (see `editor-store.ts`).
 *
 * Idea settings (name, tempo, time signature, grid) are columns of the `projects` row: that change's
 * `before` and `after` are always set. New editable rows (sections) get their own `table` variant here.
 */
import type { Clip, IdeaSettings, Project, Track } from '@/features/projects/projects-repo';

export type ProjectTrack = Project['tracks'][number];

export type Change =
  | { table: 'tracks'; id: string; before: Track | null; after: Track | null }
  | { table: 'clips'; id: string; before: Clip | null; after: Clip | null }
  | { table: 'projects'; id: string; before: IdeaSettings; after: IdeaSettings };

/** One undo step. */
export type Edit = { label: string; changes: Change[] };

/** The edit that undoes `edit`. */
export function invertEdit(edit: Edit): Edit {
  return {
    label: edit.label,
    changes: edit.changes.map(invertChange).reverse(),
  };
}

function invertChange(change: Change): Change {
  switch (change.table) {
    case 'tracks':
      return { table: 'tracks', id: change.id, before: change.after, after: change.before };
    case 'clips':
      return { table: 'clips', id: change.id, before: change.after, after: change.before };
    case 'projects':
      return { table: 'projects', id: change.id, before: change.after, after: change.before };
  }
}

/** The settings columns of a project. */
export function ideaSettings(project: Project): IdeaSettings {
  const { name, bpm, beatsPerBar, beatUnit, grid } = project;
  return { name, bpm, beatsPerBar, beatUnit, grid };
}

/** A track without its clips, as stored in the `tracks` table. */
export function trackRow(track: ProjectTrack): Track {
  const { clips: _clips, ...row } = track;
  return row;
}

/**
 * The project after `changes`. Tracks are ordered by position and clips by start; clips whose track
 * is gone are dropped (as the database cascade does), and `duration` is recomputed.
 */
export function applyToProject(project: Project, changes: Change[]): Project {
  const tracks = new Map(project.tracks.map((track) => [track.id, trackRow(track)]));
  const clips = new Map(project.tracks.flatMap((track) => track.clips.map((c) => [c.id, c])));

  let settings = ideaSettings(project);
  for (const change of changes) {
    if (change.table === 'projects') {
      settings = change.after;
    } else if (change.table === 'tracks') {
      if (change.after) tracks.set(change.id, change.after);
      else tracks.delete(change.id);
    } else if (change.after) {
      clips.set(change.id, change.after);
    } else {
      clips.delete(change.id);
    }
  }

  const clipsByTrack = new Map<string, Clip[]>();
  for (const clip of clips.values()) {
    const list = clipsByTrack.get(clip.trackId);
    if (list) list.push(clip);
    else clipsByTrack.set(clip.trackId, [clip]);
  }

  let duration = 0;
  const nextTracks = [...tracks.values()]
    .sort((a, b) => a.position - b.position)
    .map((track) => {
      const trackClips = (clipsByTrack.get(track.id) ?? []).sort((a, b) => a.start - b.start);
      for (const clip of trackClips) duration = Math.max(duration, clip.start + clip.duration);
      return { ...track, clips: trackClips };
    });

  return { ...project, ...settings, tracks: nextTracks, duration };
}
