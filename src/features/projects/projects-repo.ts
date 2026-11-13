/**
 * Projects ("ideas"), their tracks, takes and clips in SQLite. Schema and model: `@/lib/db`.
 * The Ideas list uses these through the TanStack Query hooks in `./queries.ts`; the open idea is loaded
 * and edited through the editor store (`@/features/project/editor-store`), which writes with
 * `saveChanges`.
 */
import { randomUUID } from 'expo-crypto';

import { deleteProjectFiles, deleteTakeFiles } from '@/features/audio/take-files';
import type { Change } from '@/features/project/edit-changes';
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

/**
 * Writes an editor change set (`@/features/project/edit-changes`) in one transaction, plus the take it
 * places when one was just recorded (inserted first, so a take is always committed with its clip).
 * Deletes run before upserts, clips before tracks, so foreign keys hold whatever the edit does.
 */
export async function saveChanges(
  projectId: string,
  changes: Change[],
  take?: Take,
): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    if (take) {
      await tx.runAsync(
        `INSERT INTO takes (id, project_id, path, duration, sample_rate, channels, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        take.id,
        projectId,
        take.path,
        take.duration,
        take.sampleRate,
        take.channels,
        take.createdAt,
      );
    }
    const deleted = changes.filter((change) => !change.after);
    for (const table of ['clips', 'tracks'] as const) {
      for (const change of deleted.filter((candidate) => candidate.table === table)) {
        await tx.runAsync(`DELETE FROM ${table} WHERE id = ?`, change.id);
      }
    }
    for (const change of changes) {
      if (change.table !== 'tracks' || !change.after) continue;
      const track = change.after;
      await tx.runAsync(
        `INSERT INTO tracks (id, project_id, position, name, volume, muted, solo)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET position = excluded.position, name = excluded.name,
           volume = excluded.volume, muted = excluded.muted, solo = excluded.solo`,
        track.id,
        projectId,
        track.position,
        track.name,
        track.volume,
        track.muted ? 1 : 0,
        track.solo ? 1 : 0,
      );
    }
    for (const change of changes) {
      if (change.table !== 'clips' || !change.after) continue;
      const clip = change.after;
      await tx.runAsync(
        `INSERT INTO clips (id, track_id, take_id, start, offset, duration) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET track_id = excluded.track_id, take_id = excluded.take_id,
           start = excluded.start, offset = excluded.offset, duration = excluded.duration`,
        clip.id,
        clip.trackId,
        clip.takeId,
        clip.start,
        clip.offset,
        clip.duration,
      );
    }
    await tx.runAsync('UPDATE projects SET updated_at = ? WHERE id = ?', Date.now(), projectId);
  });
}

/**
 * Deletes the takes no clip uses (rows and files) and returns their paths. Run when an idea opens:
 * undo history doesn't outlive an open idea, so nothing can bring them back.
 */
export async function deleteUnusedTakes(projectId: string): Promise<string[]> {
  const db = await getDb();
  const unused = await db.getAllAsync<{ id: string; path: string }>(
    `SELECT id, path FROM takes t WHERE t.project_id = ?
     AND NOT EXISTS (SELECT 1 FROM clips c WHERE c.take_id = t.id)`,
    projectId,
  );
  if (unused.length === 0) return [];
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const take of unused) await tx.runAsync('DELETE FROM takes WHERE id = ?', take.id);
  });
  for (const take of unused) deleteTakeFiles(take.path);
  return unused.map((take) => take.path);
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
