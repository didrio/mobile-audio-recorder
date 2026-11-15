/**
 * Recently Deleted (T41): pure rules over the deleted folders and ideas, tested without SQLite.
 *
 * Deleting stamps every item with `deletedAt`; a deleted folder stamps its whole subtree with the same value.
 * An item whose parent folder is deleted with the *same* stamp is "nested": it isn't listed and travels with
 * that folder. Anything else deleted is a top-level row of the list.
 */
import type { ItemSelection } from './folder-tree';
import type { Folder } from './folders-repo';
import type { ProjectSummary } from './projects-repo';

export const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

/** Whole days left before the purge (at least 1 until it's actually expired). */
export function daysLeft(deletedAt: number, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((deletedAt + RETENTION_DAYS * DAY_MS - now) / DAY_MS));
}

/** Items deleted before this moment are purged. */
export function purgeCutoff(now: number = Date.now()): number {
  return now - RETENTION_DAYS * DAY_MS;
}

export function isExpired(deletedAt: number, now: number = Date.now()): boolean {
  return deletedAt < purgeCutoff(now);
}

/** "1 day left", "29 days left". */
export function daysLeftLabel(deletedAt: number, now: number = Date.now()): string {
  const days = daysLeft(deletedAt, now);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

type DeletedFolder = Pick<Folder, 'id' | 'parentId'> & { deletedAt: number | null };
type DeletedIdea = Pick<ProjectSummary, 'id' | 'folderId'> & { deletedAt: number | null };

/** The rows of the Recently Deleted list: deleted items that aren't inside a folder deleted with them. */
export function topLevelDeleted<F extends DeletedFolder, I extends DeletedIdea>(
  folders: readonly F[],
  ideas: readonly I[],
): { folders: F[]; ideas: I[] } {
  const stamps = new Map(folders.map((folder) => [folder.id, folder.deletedAt]));
  const nested = (parentId: string | null, deletedAt: number | null) =>
    parentId !== null && stamps.has(parentId) && stamps.get(parentId) === deletedAt;
  return {
    folders: folders.filter((folder) => !nested(folder.parentId, folder.deletedAt)),
    ideas: ideas.filter((idea) => !nested(idea.folderId, idea.deletedAt)),
  };
}

/**
 * Every row a Restore or Delete Now of `selection` touches: the chosen items plus what was deleted together
 * with the chosen folders (same stamp, at any depth).
 */
export function collectDeleted(
  folders: readonly DeletedFolder[],
  ideas: readonly DeletedIdea[],
  selection: ItemSelection,
): { folderIds: Set<string>; ideaIds: Set<string> } {
  const folderIds = new Set(selection.folderIds);
  const ideaIds = new Set(selection.ideaIds);
  const queue = [...folderIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const stamp = folders.find((folder) => folder.id === id)?.deletedAt;
    if (stamp == null) continue;
    for (const folder of folders) {
      if (folder.parentId === id && folder.deletedAt === stamp && !folderIds.has(folder.id)) {
        folderIds.add(folder.id);
        queue.push(folder.id);
      }
    }
    for (const idea of ideas)
      if (idea.folderId === id && idea.deletedAt === stamp) ideaIds.add(idea.id);
  }
  return { folderIds, ideaIds };
}

/**
 * Where a restored item goes: back into its original folder, or the root (`null`) when that folder is gone
 * or is itself still deleted.
 */
export function restoreDestination(
  originalParentId: string | null,
  activeFolderIds: ReadonlySet<string>,
): string | null {
  return originalParentId !== null && activeFolderIds.has(originalParentId)
    ? originalParentId
    : null;
}

/** Title and message of the confirmation before Delete Now. */
export function deleteNowMessage(
  selection: ItemSelection,
  names: { ideas: readonly string[]; folders: readonly string[] },
): { title: string; message: string } {
  const total = selection.ideaIds.length + selection.folderIds.length;
  const only = names.ideas[0] ?? names.folders[0];
  const subject = total === 1 && only ? `“${only}”` : `${total} items`;
  return {
    title: `Delete ${subject} now?`,
    message: 'It will be deleted for good, with its recordings. This can’t be undone.',
  };
}
