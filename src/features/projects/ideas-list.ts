/** Sorting, searching and date labels for the Ideas list. Pure, so a folder's contents (T19) can reuse them. */
import type { ProjectSummary } from './projects-repo';

export const SORT_ORDERS = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Date created' },
] as const;
export type SortOrder = (typeof SORT_ORDERS)[number]['value'];

export function isSortOrder(value: unknown): value is SortOrder {
  return SORT_ORDERS.some((order) => order.value === value);
}

/** A sorted copy: newest edit first, A→Z (numbers in order: "Idea 2" before "Idea 10"), or newest created. */
export function sortIdeas(ideas: readonly ProjectSummary[], order: SortOrder): ProjectSummary[] {
  const sorted = [...ideas];
  if (order === 'name') {
    sorted.sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
        b.createdAt - a.createdAt,
    );
  } else if (order === 'created') {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return sorted;
}

/** Ideas whose name contains the query (case-insensitive); a blank query keeps everything. */
export function filterIdeas(ideas: readonly ProjectSummary[], query: string): ProjectSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...ideas];
  return ideas.filter((idea) => idea.name.toLowerCase().includes(needle));
}

/** "Today", "Yesterday", "Mar 5", or "Mar 5, 2025" for another year. */
export function formatIdeaDate(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  });
}

/** Storage as "12.4 MB" / "0 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
