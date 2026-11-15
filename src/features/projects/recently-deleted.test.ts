import type { ItemSelection } from './folder-tree';
import {
  collectDeleted,
  daysLeft,
  daysLeftLabel,
  deleteNowMessage,
  isExpired,
  purgeCutoff,
  restoreDestination,
  topLevelDeleted,
} from './recently-deleted';

const DAY = 86_400_000;
const folder = (id: string, parentId: string | null, deletedAt: number | null) => ({
  id,
  parentId,
  deletedAt,
});
const idea = (id: string, folderId: string | null, deletedAt: number | null) => ({
  id,
  folderId,
  deletedAt,
});

describe('retention', () => {
  const now = 100 * DAY;

  it('counts whole days left, never below 1 until expired', () => {
    expect(daysLeft(now, now)).toBe(30);
    expect(daysLeft(now - 29 * DAY - 1000, now)).toBe(1);
    expect(daysLeft(now - 29.5 * DAY, now)).toBe(1);
    expect(daysLeftLabel(now - 28 * DAY, now)).toBe('2 days left');
    expect(daysLeftLabel(now - 29 * DAY, now)).toBe('1 day left');
  });

  it('expires items older than 30 days', () => {
    expect(purgeCutoff(now)).toBe(70 * DAY);
    expect(isExpired(70 * DAY, now)).toBe(false);
    expect(isExpired(70 * DAY - 1, now)).toBe(true);
  });
});

describe('topLevelDeleted', () => {
  it('hides items deleted together with their folder, keeps ones deleted separately', () => {
    const folders = [folder('a', null, 10), folder('b', 'a', 10), folder('c', 'a', 5)];
    const ideas = [
      idea('i1', 'a', 10),
      idea('i2', 'a', 3),
      idea('i3', 'live', 7),
      idea('i4', null, 8),
    ];

    const top = topLevelDeleted(folders, ideas);

    expect(top.folders.map((f) => f.id)).toEqual(['a', 'c']);
    expect(top.ideas.map((i) => i.id)).toEqual(['i2', 'i3', 'i4']);
  });
});

describe('collectDeleted', () => {
  const folders = [
    folder('a', null, 10),
    folder('b', 'a', 10),
    folder('c', 'b', 10),
    folder('d', 'a', 5),
  ];
  const ideas = [idea('i1', 'c', 10), idea('i2', 'a', 4), idea('i3', null, 9)];

  it('takes everything deleted together with a chosen folder, at any depth', () => {
    const selection: ItemSelection = { ideaIds: [], folderIds: ['a'] };
    const { folderIds, ideaIds } = collectDeleted(folders, ideas, selection);
    expect([...folderIds].sort()).toEqual(['a', 'b', 'c']);
    expect([...ideaIds]).toEqual(['i1']);
  });

  it('adds chosen ideas as they are', () => {
    const { folderIds, ideaIds } = collectDeleted(folders, ideas, {
      ideaIds: ['i3'],
      folderIds: [],
    });
    expect(folderIds.size).toBe(0);
    expect([...ideaIds]).toEqual(['i3']);
  });
});

describe('restoreDestination', () => {
  const active = new Set(['demos']);

  it('returns to the original folder when it is still there', () => {
    expect(restoreDestination('demos', active)).toBe('demos');
  });

  it('falls back to the root when the folder is gone, still deleted, or it was the root', () => {
    expect(restoreDestination('gone', active)).toBeNull();
    expect(restoreDestination(null, active)).toBeNull();
  });
});

describe('deleteNowMessage', () => {
  it('names a single item and counts several', () => {
    expect(
      deleteNowMessage({ ideaIds: ['a'], folderIds: [] }, { ideas: ['Riff'], folders: [] }).title,
    ).toBe('Delete “Riff” now?');
    expect(
      deleteNowMessage(
        { ideaIds: ['a', 'b'], folderIds: ['c'] },
        { ideas: ['x', 'y'], folders: ['z'] },
      ).title,
    ).toBe('Delete 3 items now?');
  });
});
