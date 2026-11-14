import { filterIdeas, formatBytes, formatIdeaDate, sortIdeas } from './ideas-list';
import type { ProjectSummary } from './projects-repo';

const idea = (id: string, name: string, createdAt: number, updatedAt: number): ProjectSummary => ({
  id,
  name,
  createdAt,
  updatedAt,
  duration: 0,
});

const ideas = [
  idea('a', 'Idea 10', 100, 300),
  idea('b', 'chorus riff', 200, 100),
  idea('c', 'Idea 2', 300, 200),
];

describe('sortIdeas', () => {
  it('puts the latest edit first by default', () => {
    expect(sortIdeas(ideas, 'recent').map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });
  it('sorts by name, ignoring case and ordering numbers naturally', () => {
    expect(sortIdeas(ideas, 'name').map((i) => i.name)).toEqual([
      'chorus riff',
      'Idea 2',
      'Idea 10',
    ]);
  });
  it('sorts by creation date, newest first', () => {
    expect(sortIdeas(ideas, 'created').map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
  it('does not change the input', () => {
    sortIdeas(ideas, 'name');
    expect(ideas.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('filterIdeas', () => {
  it('matches part of a name, case-insensitively', () => {
    expect(filterIdeas(ideas, ' RIFF ').map((i) => i.id)).toEqual(['b']);
  });
  it('keeps everything for a blank query', () => {
    expect(filterIdeas(ideas, '  ')).toHaveLength(3);
  });
});

describe('formatIdeaDate', () => {
  const now = new Date(2026, 10, 14, 15, 0).getTime();
  it('says Today and Yesterday', () => {
    expect(formatIdeaDate(new Date(2026, 10, 14, 1, 0).getTime(), now)).toBe('Today');
    expect(formatIdeaDate(new Date(2026, 10, 13, 23, 0).getTime(), now)).toBe('Yesterday');
  });
  it('adds the year only for another year', () => {
    expect(formatIdeaDate(new Date(2026, 2, 5).getTime(), now)).not.toMatch(/2026/);
    expect(formatIdeaDate(new Date(2025, 2, 5).getTime(), now)).toMatch(/2025/);
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.00 GB');
  });
});
