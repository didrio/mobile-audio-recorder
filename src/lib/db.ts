/**
 * The app's SQLite database (projects, tracks, takes, clips).
 *
 * One shared connection, opened lazily and migrated before first use. It's a plain promise rather than
 * `SQLiteProvider` because the audio flow writes to it outside React.
 *
 * Data model (non-destructive editing):
 * - `takes` are immutable recorded files. `path` is RELATIVE to the document directory, because the
 *   absolute container path changes between installs/updates on iOS.
 * - `clips` are windows onto a take placed on a track: `start` (timeline position), `offset` (where in
 *   the take playback begins) and `duration`, all in seconds. Trim/move/split only change these numbers.
 * - The open idea is edited through the editor store (`@/features/project/editor-store`): edits are
 *   snapshots of the track/clip rows they touch, applied in memory and written with `saveChanges`
 *   (`projects-repo.ts`). Undo history lives only while the idea is open, so takes no clip uses are
 *   deleted (rows + files) the next time it opens.
 *
 * Migrations: add a new `if (version < N)` block and bump `SCHEMA_VERSION`. Never edit an old block.
 */
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'audio-recorder.db';
const SCHEMA_VERSION = 4;

let database: Promise<SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLiteDatabase> {
  database ??= open().catch((error: unknown) => {
    database = null; // allow a retry on the next call
    throw error;
  });
  return database;
}

async function open(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return db;
}

async function migrate(db: SQLiteDatabase) {
  // Connection settings must be applied outside the migration transaction.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new Error('The database was created by a newer version of the app.');
  }
  if (version === SCHEMA_VERSION) return;

  await db.withExclusiveTransactionAsync(async (tx) => {
    if (version < 1) {
      await tx.execAsync(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE tracks (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          name TEXT NOT NULL,
          volume REAL NOT NULL DEFAULT 1,
          muted INTEGER NOT NULL DEFAULT 0,
          solo INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX tracks_project ON tracks(project_id, position);
        CREATE TABLE takes (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          duration REAL NOT NULL,
          sample_rate INTEGER NOT NULL,
          channels INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX takes_project ON takes(project_id);
        CREATE TABLE clips (
          id TEXT PRIMARY KEY NOT NULL,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          take_id TEXT NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
          start REAL NOT NULL,
          offset REAL NOT NULL DEFAULT 0,
          duration REAL NOT NULL
        );
        CREATE INDEX clips_track ON clips(track_id);
      `);
    }
    if (version < 2) {
      // The track Record records onto (T15). Null = nothing armed; deleting the track clears it.
      await tx.execAsync(`
        ALTER TABLE projects ADD COLUMN armed_track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL;
        UPDATE projects SET armed_track_id = (
          SELECT t.id FROM tracks t WHERE t.project_id = projects.id ORDER BY t.position LIMIT 1
        );
      `);
    }
    if (version < 3) {
      // Pre-roll on/off per idea (T25): Record starts playback a little before the playhead.
      await tx.execAsync('ALTER TABLE projects ADD COLUMN pre_roll INTEGER NOT NULL DEFAULT 0;');
    }
    if (version < 4) {
      // Tempo, time signature and the optional bar/beat grid per idea (T9).
      await tx.execAsync(`
        ALTER TABLE projects ADD COLUMN bpm INTEGER NOT NULL DEFAULT 120;
        ALTER TABLE projects ADD COLUMN beats_per_bar INTEGER NOT NULL DEFAULT 4;
        ALTER TABLE projects ADD COLUMN beat_unit INTEGER NOT NULL DEFAULT 4;
        ALTER TABLE projects ADD COLUMN grid INTEGER NOT NULL DEFAULT 0;
      `);
    }
    await tx.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
