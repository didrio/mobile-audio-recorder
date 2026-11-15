/**
 * The app's SQLite database (folders, projects, tracks, takes, clips, sections).
 *
 * One shared connection, opened lazily and migrated before first use. It's a plain promise rather than
 * `SQLiteProvider` because the audio flow writes to it outside React.
 *
 * Data model (non-destructive editing):
 * - `takes` are immutable recorded files. `path` is RELATIVE to the document directory, because the
 *   absolute container path changes between installs/updates on iOS.
 * - `clips` are windows onto a take placed on a track: `start` (timeline position), `offset` (where in
 *   the take playback begins) and `duration`, all in seconds. Trim/move/split only change these numbers.
 *   Each clip also has a `gain` (linear, 1 = 0 dB) and `fade_in` / `fade_out` lengths in seconds (T16).
 * - `sections` (T18) label spans of the timeline (Intro, Verse…): `start`/`duration` in seconds, a palette
 *   `color` key (`@/features/project/sections`) and a free-text `notes`. They never overlap.
 * - `projects.notes` (T24) is the idea's free-text notes. Saved on its own (`setProjectNotes`), not an undo
 *   step: the text field has its own undo.
 * - `folders` (T19) nest without a depth limit (`parent_id` NULL = the Ideas root; deleting a folder
 *   cascades to its subfolders). `projects.folder_id` (NULL = root) uses ON DELETE SET NULL as a safety
 *   net: real folder deletion (`deleteItems` in `folders-repo.ts`) removes the ideas and their files
 *   first, and a cascade would drop idea rows but leave their audio behind. `projects.favorite` stars an
 *   idea wherever it lives; starring and moving don't touch `updated_at`.
 * - The open idea is edited through the editor store (`@/features/project/editor-store`): edits are
 *   snapshots of the track/clip/section rows they touch, applied in memory and written with `saveChanges`
 *   (`projects-repo.ts`). Undo history lives only while the idea is open, so takes no clip uses are
 *   deleted (rows + files) the next time it opens.
 *
 * Migrations: add a new `if (version < N)` block and bump `SCHEMA_VERSION`. Never edit an old block.
 */
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'audio-recorder.db';
const SCHEMA_VERSION = 12;

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
    if (version < 5) {
      // Metronome on/off and its volume per idea (T17).
      await tx.execAsync(`
        ALTER TABLE projects ADD COLUMN metronome INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE projects ADD COLUMN metronome_volume REAL NOT NULL DEFAULT 1;
      `);
    }
    if (version < 6) {
      // Metronome output per idea (T33): 'sound', 'visual' (the beat display) or 'both'.
      await tx.execAsync(
        "ALTER TABLE projects ADD COLUMN metronome_output TEXT NOT NULL DEFAULT 'both';",
      );
    }
    if (version < 7) {
      // Snap on/off per idea (T31): clips and the playhead snap to the grid lines when it's on.
      await tx.execAsync('ALTER TABLE projects ADD COLUMN snap INTEGER NOT NULL DEFAULT 1;');
    }
    if (version < 8) {
      // Loop toggle and region per idea (T26). No region (NULL) until Loop is first turned on.
      await tx.execAsync(`
        ALTER TABLE projects ADD COLUMN loop_on INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE projects ADD COLUMN loop_start REAL;
        ALTER TABLE projects ADD COLUMN loop_end REAL;
      `);
    }
    if (version < 9) {
      // Section labels per idea (T18).
      await tx.execAsync(`
        CREATE TABLE sections (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          start REAL NOT NULL,
          duration REAL NOT NULL,
          notes TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX sections_project ON sections(project_id, start);
      `);
    }
    if (version < 10) {
      // Idea notes (T24): free text, with `[1:23]` time stamps that seek.
      await tx.execAsync("ALTER TABLE projects ADD COLUMN notes TEXT NOT NULL DEFAULT '';");
    }
    if (version < 11) {
      // Clip options (T16): gain (linear) and fade lengths (seconds).
      await tx.execAsync(`
        ALTER TABLE clips ADD COLUMN gain REAL NOT NULL DEFAULT 1;
        ALTER TABLE clips ADD COLUMN fade_in REAL NOT NULL DEFAULT 0;
        ALTER TABLE clips ADD COLUMN fade_out REAL NOT NULL DEFAULT 0;
      `);
    }
    if (version < 12) {
      // Folders and favorites (T19).
      await tx.execAsync(`
        CREATE TABLE folders (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX folders_parent ON folders(parent_id);
        ALTER TABLE projects ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
        ALTER TABLE projects ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX projects_folder ON projects(folder_id);
      `);
    }
    await tx.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
