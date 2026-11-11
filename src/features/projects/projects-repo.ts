/**
 * Projects ("ideas"), their tracks, takes and clips in SQLite. Schema and model: `@/lib/db`.
 * Screens use these through the TanStack Query hooks in `./queries.ts`.
 */
import { randomUUID } from 'expo-crypto';

import { deleteProjectFiles } from '@/features/audio/take-files';
import { getDb } from '@/lib/db';

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

/** Saves a recorded take and places it on a track as one clip covering the whole take. */
export async function addTakeWithClip(input: {
  projectId: string;
  trackId: string;
  take: Pick<Take, 'id' | 'path' | 'duration' | 'sampleRate' | 'channels'>;
  start: number;
}): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
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
      'INSERT INTO clips (id, track_id, take_id, start, offset, duration) VALUES (?, ?, ?, ?, 0, ?)',
      randomUUID(),
      input.trackId,
      input.take.id,
      input.start,
      input.take.duration,
    );
    await tx.runAsync('UPDATE projects SET updated_at = ? WHERE id = ?', now, input.projectId);
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
