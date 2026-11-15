import {
  canMoveInto,
  collectDeletion,
  deleteMessage,
  folderPath,
  folderSubtree,
  formatFolderPath,
  itemCount,
  pickerRows,
  scopeContents,
  sortFolders,
} from './folder-tree';
import type { Folder } from './folders-repo';
import type { ProjectSummary } from './projects-repo';

const folder = (id: string, parentId: string | null, name = id, updatedAt = 0): Folder => ({
  id,
  parentId,
  name,
  createdAt: updatedAt,
  updatedAt,
  deletedAt: null,
});

const idea = (
  id: string,
  folderId: string | null,
  overrides: Partial<ProjectSummary> = {},
): ProjectSummary => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  duration: 0,
  notes: '',
  folderId,
  favorite: false,
  deletedAt: null,
  ...overrides,
});

// Demos/ (Rough/ (Old/), Final/), Lyrics/
const folders = [
  folder('demos', null, 'Demos'),
  folder('rough', 'demos', 'Rough'),
  folder('old', 'rough', 'Old'),
  folder('final', 'demos', 'Final'),
  folder('lyrics', null, 'Lyrics'),
];
const ideas = [
  idea('root-idea', null),
  idea('demo-1', 'demos'),
  idea('rough-1', 'rough'),
  idea('rough-2', 'rough'),
  idea('old-1', 'old'),
  idea('lyric-1', 'lyrics'),
];

describe('folderSubtree', () => {
  it('includes the folders themselves and everything below, at any depth', () => {
    expect([...folderSubtree(folders, ['demos'])].sort()).toEqual(
      ['demos', 'final', 'old', 'rough'].sort(),
    );
  });

  it('leaves siblings and parents alone', () => {
    expect([...folderSubtree(folders, ['rough'])].sort()).toEqual(['old', 'rough']);
  });

  it('survives a cycle in bad data', () => {
    const cyclic = [folder('a', 'b'), folder('b', 'a')];
    expect([...folderSubtree(cyclic, ['a'])].sort()).toEqual(['a', 'b']);
  });
});

describe('folderPath', () => {
  it('lists names from the root down', () => {
    expect(folderPath(folders, 'old')).toEqual(['Demos', 'Rough', 'Old']);
    expect(formatFolderPath(folders, 'old')).toBe('Demos › Rough › Old');
  });

  it('is empty for the root', () => {
    expect(folderPath(folders, null)).toEqual([]);
    expect(formatFolderPath(folders, null)).toBeNull();
  });
});

describe('canMoveInto', () => {
  it('refuses the folder itself and anything below it', () => {
    expect(canMoveInto(folders, ['demos'], 'demos')).toBe(false);
    expect(canMoveInto(folders, ['demos'], 'rough')).toBe(false);
    expect(canMoveInto(folders, ['demos'], 'old')).toBe(false);
  });

  it('allows siblings, parents and the root', () => {
    expect(canMoveInto(folders, ['rough'], 'final')).toBe(true);
    expect(canMoveInto(folders, ['old'], 'demos')).toBe(true);
    expect(canMoveInto(folders, ['demos'], null)).toBe(true);
    expect(canMoveInto(folders, [], 'old')).toBe(true);
  });
});

describe('collectDeletion and deleteMessage', () => {
  it('counts everything inside a folder', () => {
    const result = collectDeletion(folders, ideas, { folderIds: ['demos'], ideaIds: [] });
    expect(result.nestedFolders).toBe(3);
    expect(result.nestedIdeas).toBe(4);
    expect([...result.ideaIds].sort()).toEqual(['demo-1', 'old-1', 'rough-1', 'rough-2']);
  });

  it('does not count a chosen idea twice when its folder is chosen too', () => {
    const result = collectDeletion(folders, ideas, {
      folderIds: ['rough'],
      ideaIds: ['rough-1', 'root-idea'],
    });
    expect([...result.ideaIds].sort()).toEqual(['old-1', 'root-idea', 'rough-1', 'rough-2']);
    expect(result.nestedIdeas).toBe(2);
    expect(result.nestedFolders).toBe(1);
  });

  it('names a folder with its contents', () => {
    expect(deleteMessage(folders, ideas, { folderIds: ['demos'], ideaIds: [] }).title).toBe(
      'Delete “Demos” and its 3 folders and 4 ideas?',
    );
    expect(deleteMessage(folders, ideas, { folderIds: ['lyrics'], ideaIds: [] }).title).toBe(
      'Delete “Lyrics” and its 1 idea?',
    );
    expect(deleteMessage(folders, ideas, { folderIds: ['final'], ideaIds: [] }).title).toBe(
      'Delete “Final”?',
    );
  });

  it('names a single idea', () => {
    expect(deleteMessage(folders, ideas, { folderIds: [], ideaIds: ['demo-1'] }).title).toBe(
      'Delete “demo-1”?',
    );
  });

  it('sums up several items and what is inside them', () => {
    const message = deleteMessage(folders, ideas, {
      folderIds: ['rough', 'lyrics'],
      ideaIds: ['root-idea'],
    });
    expect(message.title).toBe('Delete 2 folders and 1 idea?');
    expect(message.message).toContain('(1 folder and 4 ideas)');
  });
});

describe('sortFolders', () => {
  const list = [folder('b', null, 'Idea 10', 100), folder('a', null, 'Idea 2', 200)];

  it('sorts by name with numbers in order', () => {
    expect(sortFolders(list, 'name', list, []).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('sorts by recent activity, counting ideas edited anywhere inside', () => {
    expect(sortFolders(list, 'recent', list, []).map((f) => f.id)).toEqual(['a', 'b']);
    const edited = [idea('x', 'b', { updatedAt: 500 })];
    expect(sortFolders(list, 'recent', list, edited).map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('scopeContents', () => {
  it('shows a folder’s direct contents', () => {
    const result = scopeContents({ kind: 'folder', id: 'demos' }, folders, ideas, '', 'name');
    expect(result.folders.map((f) => f.id)).toEqual(['final', 'rough']);
    expect(result.ideas.map((i) => i.id)).toEqual(['demo-1']);
  });

  it('shows the root’s direct contents', () => {
    const result = scopeContents({ kind: 'root' }, folders, ideas, '', 'name');
    expect(result.folders.map((f) => f.id)).toEqual(['demos', 'lyrics']);
    expect(result.ideas.map((i) => i.id)).toEqual(['root-idea']);
  });

  it('lists every starred idea in Favorites, wherever it lives', () => {
    const starred = ideas.map((i) =>
      i.id === 'old-1' || i.id === 'root-idea' ? { ...i, favorite: true } : i,
    );
    const result = scopeContents({ kind: 'favorites' }, folders, starred, '', 'name');
    expect(result.folders).toEqual([]);
    expect(result.ideas.map((i) => i.id)).toEqual(['old-1', 'root-idea']);
  });

  it('searches everything from the root', () => {
    const result = scopeContents({ kind: 'root' }, folders, ideas, 'rough', 'name');
    expect(result.folders.map((f) => f.id)).toEqual(['rough']);
    expect(result.ideas.map((i) => i.id)).toEqual(['rough-1', 'rough-2']);
  });

  it('searches a folder and its subfolders only', () => {
    const result = scopeContents({ kind: 'folder', id: 'rough' }, folders, ideas, '1', 'name');
    expect(result.ideas.map((i) => i.id)).toEqual(['old-1', 'rough-1']);
    expect(
      scopeContents({ kind: 'folder', id: 'rough' }, folders, ideas, 'lyric', 'name').ideas,
    ).toEqual([]);
  });

  it('finds ideas by their notes', () => {
    const noted = [...ideas, idea('n', 'old', { notes: 'Capo 2, DADGAD' })];
    const result = scopeContents({ kind: 'folder', id: 'demos' }, folders, noted, 'dadgad', 'name');
    expect(result.ideas.map((i) => i.id)).toEqual(['n']);
  });
});

describe('itemCount', () => {
  it('counts direct folders and ideas', () => {
    expect(itemCount(folders, ideas, 'demos')).toBe(3);
    expect(itemCount(folders, ideas, 'final')).toBe(0);
  });
});

describe('pickerRows', () => {
  it('lists the root then the tree depth-first, A→Z, with moved folders disabled', () => {
    expect(pickerRows(folders, ['rough'])).toEqual([
      { id: null, name: 'Ideas', depth: 0, disabled: false },
      { id: 'demos', name: 'Demos', depth: 1, disabled: false },
      { id: 'final', name: 'Final', depth: 2, disabled: false },
      { id: 'rough', name: 'Rough', depth: 2, disabled: true },
      { id: 'old', name: 'Old', depth: 3, disabled: true },
      { id: 'lyrics', name: 'Lyrics', depth: 1, disabled: false },
    ]);
  });
});
