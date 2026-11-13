/**
 * Projects ("ideas"), their tracks, takes and clips in SQLite. Schema and model: `@/lib/db`.
 * Screens use these through the TanStack Query hooks in `./queries.ts`.
 */
import { randomUUID } from 'expo-crypto';

import { deleteProjectFiles } from '@/features/audio/take-files';
import { getDb } from '@/lib/db';

import { clearRange } from './clip-overlap';

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** End of the last clip, in seconds. */
  duration: number;
};

export type Track = {
  id: string;
  projectId: string;
  position: number;
  name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
};

export type Take = {
  id: string;
  projectId: string;
  /** Relative to the document directory. */
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
  createdAt: number;
};

export type Clip = {
  id: string;
  trackId: string;
  takeId: string;
  start: number;
  offset: number;
  duration: number;
};

export type Project = ProjectSummary & {
  tracks: (Track & { clips: Clip[] })[];
  takes: Record<string, Take>;
};

type ProjectRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  duration: number;
};
type TrackRow = {
  id: string;
  project_id: string;
  position: number;
  name: string;
  volume: number;
  muted: number;
  solo: number;
};
type TakeRow = {
  id: string;
  project_id: string;
  path: string;
  duration: number;
  sample_rate: number;
  channels: number;
  created_at: number;
};
type ClipRow = {
  id: string;
  track_id: string;
  take_id: string;
  start: number;
  offset: number;
  duration: number;
};

const PROJECT_COLUMNS = `
  p.id, p.name, p.created_at, p.updated_at,
  COALESCE((
    SELECT MAX(c.start + c.duration) FROM clips c JOIN tracks t ON t.id = c.track_id
    WHERE t.project_id = p.id
  ), 0) AS duration`;

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    duration: row.duration,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects p ORDER BY p.updated_at DESC`,
  );
  return rows.map(toSummary);
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`,
    id,
  );
  if (!row) return null;

  const [trackRows, takeRows, clipRows] = await Promise.all([
    db.getAllAsync<TrackRow>('SELECT * FROM tracks WHERE project_id = ? ORDER BY position', id),
    db.getAllAsync<TakeRow>('SELECT * FROM takes WHERE project_id = ?', id),
    db.getAllAsync<ClipRow>(
      `SELECT c.* FROM clips c JOIN tracks t ON t.id = c.track_id
       WHERE t.project_id = ? ORDER BY c.start`,
      id,
    ),
  ]);

  const takes: Record<string, Take> = {};
  for (const take of takeRows) {
    takes[take.id] = {
      id: take.id,
      projectId: take.project_id,
      path: take.path,
      duration: take.duration,
      sampleRate: take.sample_rate,
      channels: take.channels,
      createdAt: take.created_at,
    };
  }

  const tracks = trackRows.map((track) => ({
    id: track.id,
    projectId: track.project_id,
    position: track.position,
    name: track.name,
    volume: track.volume,
    muted: track.muted === 1,
    solo: track.solo === 1,
    clips: clipRows
      .filter((clip) => clip.track_id === track.id)
      .map((clip) => ({
        id: clip.id,
        trackId: clip.track_id,
        takeId: clip.take_id,
        start: clip.start,
        offset: clip.offset,
        duration: clip.duration,
      })),
  }));

  return { ...toSummary(row), tracks, takes };
}

/** Creates a project with one empty track. Without a name it's called "Idea N". */
export async function createProject(name?: string): Promise<ProjectSummary> {
  const db = await getDb();
  const now = Date.now();
  const id = randomUUID();
  let projectName = name?.trim();
  if (!projectName) {
    const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM projects');
    projectName = `Idea ${(count?.n ?? 0) + 1}`;
  }

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      id,
      projectName,
      now,
      now,
    );
    await tx.runAsync(
      'INSERT INTO tracks (id, project_id, position, name) VALUES (?, ?, 0, ?)',
      randomUUID(),
      id,
      'Track 1',
    );
  });

  return { id, name: projectName, createdAt: now, updatedAt: now, duration: 0 };
}

/**
 * Saves a recorded take and places it on a track as one clip covering the take from `offset`
 * (seconds skipped at its start, default 0) to its end. The new clip replaces whatever was under it
 * on that track: overlapped clips are trimmed or split (`clip-overlap.ts`), their takes kept.
 */
export async function addTakeWithClip(input: {
  projectId: string;
  trackId: string;
  take: Pick<Take, 'id' | 'path' | 'duration' | 'sampleRate' | 'channels'>;
  start: number;
  offset?: number;
}): Promise<void> {
  const offset = Math.min(Math.max(0, input.offset ?? 0), input.take.duration);
  const db = await getDb();
  const now = Date.now();
  const start = Math.max(0, input.start);
  const duration = input.take.duration - offset;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getAllAsync<ClipRow>(
      'SELECT * FROM clips WHERE track_id = ?',
      input.trackId,
    );
    for (const edit of clearRange(existing, start, start + duration)) {
      if (edit.kind === 'delete') {
        await tx.runAsync('DELETE FROM clips WHERE id = ?', edit.id);
      } else if (edit.kind === 'update') {
        await tx.runAsync(
          'UPDATE clips SET start = ?, offset = ?, duration = ? WHERE id = ?',
          edit.start,
          edit.offset,
          edit.duration,
          edit.id,
        );
      } else {
        const original = existing.find((row) => row.id === edit.id);
        if (!original) continue;
        await tx.runAsync('UPDATE clips SET duration = ? WHERE id = ?', edit.duration, edit.id);
        await tx.runAsync(
          'INSERT INTO clips (id, track_id, take_id, start, offset, duration) VALUES (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          input.trackId,
          original.take_id,
          edit.tail.start,
          edit.tail.offset,
          edit.tail.duration,
        );
      }
    }
    await tx.runAsync(
      `INSERT INTO takes (id, project_id, path, duration, sample_rate, channels, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.take.id,
      input.projectId,
      input.take.path,
      input.take.duration,
      input.take.sampleRate,
      input.take.channels,
      now,
    );
    await tx.runAsync(
      'INSERT INTO clips (id, track_id, take_id, start, offset, duration) VALUES (?, ?, ?, ?, ?, ?)',
      randomUUID(),
      input.trackId,
      input.take.id,
      start,
      offset,
      duration,
    );
    await tx.runAsync('UPDATE projects SET updated_at = ? WHERE id = ?', now, input.projectId);
  });
}

/** Adds an empty track after the last one, named "Track N". */
export async function addTrack(projectId: string): Promise<Track> {
  const db = await getDb();
  const now = Date.now();
  const row = await db.getFirstAsync<{ last: number | null }>(
    'SELECT MAX(position) AS last FROM tracks WHERE project_id = ?',
    projectId,
  );
  const position = (row?.last ?? -1) + 1;
  const track: Track = {
    id: randomUUID(),
    projectId,
    position,
    name: `Track ${position + 1}`,
    volume: 1,
    muted: false,
    solo: false,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT INTO tracks (id, project_id, position, name) VALUES (?, ?, ?, ?)',
      track.id,
      projectId,
      position,
      track.name,
    );
    await tx.runAsync('UPDATE projects SET updated_at = ? WHERE id = ?', now, projectId);
  });
  return track;
}

/** Renames a track; an empty name is ignored. */
export async function renameTrack(input: {
  projectId: string;
  trackId: string;
  name: string;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) return;
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE tracks SET name = ? WHERE id = ?', name, input.trackId);
    await tx.runAsync(
      'UPDATE projects SET updated_at = ? WHERE id = ?',
      Date.now(),
      input.projectId,
    );
  });
}

/**
 * Deletes a track and its clips. Its takes stay (they may be reused once clips can move between
 * tracks) until the project is deleted. A project always keeps at least one track.
 */
export async function deleteTrack(input: { projectId: string; trackId: string }): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const count = await tx.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM tracks WHERE project_id = ?',
      input.projectId,
    );
    if ((count?.n ?? 0) <= 1) throw new Error('An idea needs at least one track.');
    await tx.runAsync('DELETE FROM tracks WHERE id = ?', input.trackId);
    await tx.runAsync(
      'UPDATE projects SET updated_at = ? WHERE id = ?',
      Date.now(),
      input.projectId,
    );
  });
}

/** Deletes the project, its rows (cascade) and its audio files. Returns the deleted take paths. */
export async function deleteProject(id: string): Promise<string[]> {
  const db = await getDb();
  const takes = await db.getAllAsync<{ path: string }>(
    'SELECT path FROM takes WHERE project_id = ?',
    id,
  );
  await db.runAsync('DELETE FROM projects WHERE id = ?', id);
  deleteProjectFiles(id);
  return takes.map((take) => take.path);
}
