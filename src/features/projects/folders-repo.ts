/**
 * Folders in the Ideas tab (T19), plus the operations that span folders and ideas: moving and deleting
 * several items at once. Schema: `@/lib/db`. Tree logic lives in `./folder-tree.ts` (pure, tested).
 */
import { randomUUID } from 'expo-crypto';

import { getDb } from '@/lib/db';

import { canMoveInto, collectDeletion, type ItemSelection } from './folder-tree';

export type Folder = {
  id: string;
  /** `null` = the Ideas root. */
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** When it was moved to Recently Deleted (T41); `null` = not deleted. */
  deletedAt: number | null;
};

type FolderRow = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Every folder that isn't in Recently Deleted. */
export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FolderRow>(
    'SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY name',
  );
  return rows.map(toFolder);
}

/** The folders in Recently Deleted (T41), nested ones included. */
export async function listDeletedFolders(): Promise<Folder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FolderRow>(
    'SELECT * FROM folders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
  );
  return rows.map(toFolder);
}

/** Creates a folder inside `parentId` (`null` = root). Blank names become "New Folder". */
export async function createFolder(parentId: string | null, name: string): Promise<Folder> {
  const db = await getDb();
  const now = Date.now();
  const folder: Folder = {
    id: randomUUID(),
    parentId,
    name: name.trim() || 'New Folder',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.runAsync(
    'INSERT INTO folders (id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    folder.id,
    folder.parentId,
    folder.name,
    now,
    now,
  );
  return folder;
}

/** Renames a folder (blank names are ignored). */
export async function renameFolder(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const db = await getDb();
  await db.runAsync(
    'UPDATE folders SET name = ?, updated_at = ? WHERE id = ?',
    trimmed,
    Date.now(),
    id,
  );
}

/**
 * Moves ideas and folders into `targetId` (`null` = root). Throws if a folder would go into itself or
 * below itself. Ideas keep their `updated_at`; the target folder's is bumped (it changed).
 */
export async function moveItems(selection: ItemSelection, targetId: string | null): Promise<void> {
  const folders = await listFolders();
  if (!canMoveInto(folders, selection.folderIds, targetId)) {
    throw new Error('A folder can’t be moved into itself or one of its folders.');
  }
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const id of selection.ideaIds) {
      await tx.runAsync('UPDATE projects SET folder_id = ? WHERE id = ?', targetId, id);
    }
    for (const id of selection.folderIds) {
      await tx.runAsync('UPDATE folders SET parent_id = ? WHERE id = ?', targetId, id);
    }
    if (targetId) {
      await tx.runAsync('UPDATE folders SET updated_at = ? WHERE id = ?', Date.now(), targetId);
    }
  });
}

/**
 * Moves ideas and folders (with everything inside the folders) to Recently Deleted (T41): one shared
 * `deleted_at` on every row still alive, in one transaction. Nothing is removed from disk; `purgeItems` does that.
 */
export async function deleteItems(selection: ItemSelection): Promise<void> {
  const db = await getDb();
  const folders = await listFolders();
  const ideas = await db.getAllAsync<{ id: string; folder_id: string | null }>(
    'SELECT id, folder_id FROM projects WHERE deleted_at IS NULL',
  );
  const { folderIds, ideaIds } = collectDeletion(
    folders,
    ideas.map((idea) => ({ id: idea.id, folderId: idea.folder_id })),
    selection,
  );
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const id of ideaIds) {
      await tx.runAsync('UPDATE projects SET deleted_at = ? WHERE id = ?', now, id);
    }
    for (const id of folderIds) {
      await tx.runAsync('UPDATE folders SET deleted_at = ? WHERE id = ?', now, id);
    }
  });
}
