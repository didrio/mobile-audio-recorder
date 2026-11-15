/**
 * The Ideas tab as a file system (T19): pure tree logic over every folder and idea, so each view (the
 * root, a folder, Favorites, search, the Move sheet) is derived the same way and tested without SQLite.
 */
import type { Folder } from './folders-repo';
import { filterIdeas, sortIdeas, type SortOrder } from './ideas-list';
import type { ProjectSummary } from './projects-repo';

/** What an Ideas list shows: the root, one folder's contents, or every starred idea. */
export type IdeasScope = { kind: 'root' } | { kind: 'folder'; id: string } | { kind: 'favorites' };

/** Items picked for an action (move, delete, and T37's export). */
export type ItemSelection = { ideaIds: readonly string[]; folderIds: readonly string[] };

export function childFolders(folders: readonly Folder[], parentId: string | null): Folder[] {
  return folders.filter((folder) => folder.parentId === parentId);
}

export function ideasIn(ideas: readonly ProjectSummary[], folderId: string | null) {
  return ideas.filter((idea) => idea.folderId === folderId);
}

/** The given folders plus every folder below them, at any depth. */
export function folderSubtree(folders: readonly Folder[], ids: Iterable<string>): Set<string> {
  const result = new Set(ids);
  const queue = [...result];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const child of folders) {
      if (child.parentId === id && !result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return result;
}

/** Folder names from the root down to (and including) `folderId`; `[]` for the root. */
export function folderPath(folders: readonly Folder[], folderId: string | null): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names;
}

/** "Demos › Rough", or `null` for the root. */
export function formatFolderPath(folders: readonly Folder[], folderId: string | null) {
  const names = folderPath(folders, folderId);
  return names.length > 0 ? names.join(' › ') : null;
}

/** A folder can't go into itself or anything below it; the root (`null`) always accepts. */
export function canMoveInto(
  folders: readonly Folder[],
  movingFolderIds: readonly string[],
  targetId: string | null,
): boolean {
  if (targetId === null) return true;
  return !folderSubtree(folders, movingFolderIds).has(targetId);
}

/** Everything a delete removes: the chosen items plus whatever is inside the chosen folders. */
export function collectDeletion(
  folders: readonly Folder[],
  ideas: readonly Pick<ProjectSummary, 'id' | 'folderId'>[],
  selection: ItemSelection,
) {
  const folderIds = folderSubtree(folders, selection.folderIds);
  const ideaIds = new Set(selection.ideaIds);
  for (const idea of ideas) {
    if (idea.folderId && folderIds.has(idea.folderId)) ideaIds.add(idea.id);
  }
  return {
    folderIds,
    ideaIds,
    /** Folders and ideas inside the chosen folders (not chosen themselves). */
    nestedFolders: folderIds.size - new Set(selection.folderIds).size,
    nestedIdeas: ideaIds.size - new Set(selection.ideaIds).size,
  };
}

/** "1 idea", "9 ideas". */
export function countLabel(count: number, noun: 'idea' | 'folder' | 'item') {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "2 folders and 9 ideas", "1 idea", "" (folders first; empty parts left out). */
function foldersAndIdeas(folderCount: number, ideaCount: number) {
  const parts = [
    folderCount > 0 ? countLabel(folderCount, 'folder') : null,
    ideaCount > 0 ? countLabel(ideaCount, 'idea') : null,
  ].filter(Boolean);
  return parts.join(' and ');
}

/** Title and message of the confirmation before deleting `selection`. */
export function deleteMessage(
  folders: readonly Folder[],
  ideas: readonly ProjectSummary[],
  selection: ItemSelection,
): { title: string; message: string } {
  const { nestedFolders, nestedIdeas } = collectDeletion(folders, ideas, selection);
  const irreversible = 'This can’t be undone.';
  const { ideaIds, folderIds } = selection;

  if (folderIds.length === 1 && ideaIds.length === 0) {
    const name = folders.find((folder) => folder.id === folderIds[0])?.name ?? 'folder';
    const contents = foldersAndIdeas(nestedFolders, nestedIdeas);
    return contents
      ? {
          title: `Delete “${name}” and its ${contents}?`,
          message: `Everything in it and the recordings will be deleted. ${irreversible}`,
        }
      : { title: `Delete “${name}”?`, message: irreversible };
  }
  if (ideaIds.length === 1 && folderIds.length === 0) {
    const name = ideas.find((idea) => idea.id === ideaIds[0])?.name ?? 'idea';
    return {
      title: `Delete “${name}”?`,
      message: `The idea and its recordings will be deleted. ${irreversible}`,
    };
  }
  const inside = foldersAndIdeas(nestedFolders, nestedIdeas);
  return {
    title: `Delete ${foldersAndIdeas(folderIds.length, ideaIds.length)}?`,
    message: inside
      ? `What’s in the folders (${inside}) and all the recordings will be deleted too. ${irreversible}`
      : `The recordings will be deleted. ${irreversible}`,
  };
}

/** The newest edit of the folder itself or of any idea anywhere under it. */
function lastActivity(
  folder: Folder,
  folders: readonly Folder[],
  ideas: readonly ProjectSummary[],
) {
  const subtree = folderSubtree(folders, [folder.id]);
  let latest = folder.updatedAt;
  for (const idea of ideas) {
    if (idea.folderId && subtree.has(idea.folderId) && idea.updatedAt > latest) {
      latest = idea.updatedAt;
    }
  }
  return latest;
}

/** A sorted copy, with the same orders as the ideas (T10). "Recent" counts activity inside the folder. */
export function sortFolders(
  list: readonly Folder[],
  order: SortOrder,
  folders: readonly Folder[],
  ideas: readonly ProjectSummary[],
): Folder[] {
  const sorted = [...list];
  if (order === 'name') {
    sorted.sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
        b.createdAt - a.createdAt,
    );
  } else if (order === 'created') {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    const activity = new Map(
      list.map((folder) => [folder.id, lastActivity(folder, folders, ideas)]),
    );
    sorted.sort((a, b) => activity.get(b.id)! - activity.get(a.id)!);
  }
  return sorted;
}

/**
 * What a list shows, sorted (folders always before ideas). Without a query: the scope's direct contents
 * (Favorites: every starred idea, wherever it lives). With one: matches anywhere under the scope (the root
 * = everything), folders by name and ideas by name or notes.
 */
export function scopeContents(
  scope: IdeasScope,
  folders: readonly Folder[],
  ideas: readonly ProjectSummary[],
  query: string,
  order: SortOrder,
): { folders: Folder[]; ideas: ProjectSummary[] } {
  const needle = query.trim().toLowerCase();
  let shownFolders: Folder[];
  let shownIdeas: ProjectSummary[];

  if (scope.kind === 'favorites') {
    shownFolders = [];
    shownIdeas = filterIdeas(
      ideas.filter((idea) => idea.favorite),
      query,
    );
  } else {
    const parentId = scope.kind === 'folder' ? scope.id : null;
    if (!needle) {
      shownFolders = childFolders(folders, parentId);
      shownIdeas = ideasIn(ideas, parentId);
    } else {
      const subtree = folderSubtree(folders, parentId ? [parentId] : []);
      const inScope = (folderId: string | null) =>
        parentId === null || (folderId !== null && subtree.has(folderId));
      shownFolders = folders.filter(
        (folder) =>
          folder.id !== parentId &&
          inScope(folder.parentId) &&
          folder.name.toLowerCase().includes(needle),
      );
      shownIdeas = filterIdeas(
        ideas.filter((idea) => inScope(idea.folderId)),
        query,
      );
    }
  }
  return {
    folders: sortFolders(shownFolders, order, folders, ideas),
    ideas: sortIdeas(shownIdeas, order),
  };
}

/** How many folders and ideas are directly inside a folder (the number on its row). */
export function itemCount(
  folders: readonly Folder[],
  ideas: readonly ProjectSummary[],
  folderId: string,
) {
  return childFolders(folders, folderId).length + ideasIn(ideas, folderId).length;
}

export type PickerRow = { id: string | null; name: string; depth: number; disabled: boolean };

/**
 * The Move sheet's list: the root ("Ideas"), then every folder depth-first, A→Z within a level. Folders
 * being moved, and everything below them, are disabled.
 */
export function pickerRows(folders: readonly Folder[], movingFolderIds: readonly string[]) {
  const blocked = folderSubtree(folders, movingFolderIds);
  const rows: PickerRow[] = [{ id: null, name: 'Ideas', depth: 0, disabled: false }];
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of sortFolders(childFolders(folders, parentId), 'name', folders, [])) {
      rows.push({ id: folder.id, name: folder.name, depth, disabled: blocked.has(folder.id) });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 1);
  return rows;
}
