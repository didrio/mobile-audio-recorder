/**
 * Recently Deleted (T41): list, restore and permanently delete what `deleteItems` (`./folders-repo.ts`)
 * soft-deleted. The rules live in `./recently-deleted.ts` (pure, tested).
 */
import { Directory, Paths } from 'expo-file-system';

import { deleteProjectFiles } from '@/features/audio/take-files';
import { getDb } from '@/lib/db';

import type { ItemSelection } from './folder-tree';
import { listDeletedFolders, listFolders, type Folder } from './folders-repo';
import { listDeletedProjects, type ProjectSummary } from './projects-repo';
import { collectDeleted, purgeCutoff, restoreDestination } from './recently-deleted';

export type DeletedItems = { folders: Folder[]; ideas: ProjectSummary[] };

/** Every deleted folder and idea (nested ones too; `topLevelDeleted` picks the list rows). */
export async function listDeleted(): Promise<DeletedItems> {
  const [folders, ideas] = await Promise.all([listDeletedFolders(), listDeletedProjects()]);
  return { folders, ideas };
}

/**
 * Brings items back (folders with what was deleted together with them). Each chosen item returns to its
 * original folder, or to the root when that folder is gone or still deleted.
 */
export async function restoreItems(selection: ItemSelection): Promise<void> {
  const deleted = await listDeleted();
  const active = new Set((await listFolders()).map((folder) => folder.id));
  const { folderIds, ideaIds } = collectDeleted(deleted.folders, deleted.ideas, selection);
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const id of selection.folderIds) {
      const folder = deleted.folders.find((candidate) => candidate.id === id);
      if (!folder) continue;
      const parentId = restoreDestination(folder.parentId, active);
      await tx.runAsync('UPDATE folders SET parent_id = ? WHERE id = ?', parentId, id);
    }
    for (const id of selection.ideaIds) {
      const idea = deleted.ideas.find((candidate) => candidate.id === id);
      if (!idea) continue;
      const folderId = restoreDestination(idea.folderId, active);
      await tx.runAsync('UPDATE projects SET folder_id = ? WHERE id = ?', folderId, id);
    }
    for (const id of folderIds) {
      await tx.runAsync('UPDATE folders SET deleted_at = NULL WHERE id = ?', id);
    }
    for (const id of ideaIds) {
      await tx.runAsync('UPDATE projects SET deleted_at = NULL WHERE id = ?', id);
    }
  });
}

/** Deletes the given ideas and folders for good: rows in one transaction, then the audio files. */
async function purge(ideaIds: Iterable<string>, folderIds: Iterable<string>): Promise<string[]> {
  const db = await getDb();
  const ideas = [...ideaIds];
  const takePaths: string[] = [];
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const id of ideas) {
      const takes = await tx.getAllAsync<{ path: string }>(
        'SELECT path FROM takes WHERE project_id = ?',
        id,
      );
      takePaths.push(...takes.map((take) => take.path));
      await tx.runAsync('DELETE FROM projects WHERE id = ?', id);
    }
    // Subfolders go with their parent (ON DELETE CASCADE); deleting each is harmless either way.
    for (const id of folderIds) await tx.runAsync('DELETE FROM folders WHERE id = ?', id);
  });
  for (const id of ideas) deleteProjectFiles(id);
  return takePaths;
}

/** "Delete Now": removes the chosen deleted items and what went with them. Returns the deleted take paths. */
export async function purgeItems(selection: ItemSelection): Promise<string[]> {
  const deleted = await listDeleted();
  const { folderIds, ideaIds } = collectDeleted(deleted.folders, deleted.ideas, selection);
  return purge(ideaIds, folderIds);
}

/** Removes everything that has been in Recently Deleted for more than 30 days (run at launch). */
export async function purgeExpired(now: number = Date.now()): Promise<string[]> {
  const db = await getDb();
  const cutoff = purgeCutoff(now);
  const ideas = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    cutoff,
  );
  const folders = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM folders WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    cutoff,
  );
  if (ideas.length === 0 && folders.length === 0) return [];
  return purge(
    ideas.map((idea) => idea.id),
    folders.map((folder) => folder.id),
  );
}

/** Bytes of audio held by ideas in Recently Deleted (Settings → Storage counts them separately). */
export async function deletedRecordingsBytes(): Promise<number> {
  const db = await getDb();
  const ideas = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM projects WHERE deleted_at IS NOT NULL',
  );
  let total = 0;
  for (const { id } of ideas) {
    const directory = new Directory(Paths.document, 'projects', id);
    if (directory.exists) total += directory.size ?? 0;
  }
  return total;
}
