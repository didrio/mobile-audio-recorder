/**
 * Undo/redo history of the open idea: past edits (newest last) and undone ones that can be redone
 * (next to redo last). In memory only, cleared when the idea closes. Pure; the store applies the edits.
 */
import type { Edit } from './edit-changes';

export const HISTORY_LIMIT = 100;

export type History = { past: Edit[]; future: Edit[] };

export const emptyHistory: History = { past: [], future: [] };

/** Records a new edit: the oldest step falls off past the limit, and redo is no longer possible. */
export function pushEdit(history: History, edit: Edit): History {
  const past = [...history.past, edit];
  return { past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), future: [] };
}

/** The edit to undo (apply its inverse) and the history after undoing it; `null` if none. */
export function undoStep(history: History): { edit: Edit; history: History } | null {
  const edit = history.past.at(-1);
  if (!edit) return null;
  return {
    edit,
    history: { past: history.past.slice(0, -1), future: [...history.future, edit] },
  };
}

/** The edit to redo (apply it again) and the history after redoing it; `null` if none. */
export function redoStep(history: History): { edit: Edit; history: History } | null {
  const edit = history.future.at(-1);
  if (!edit) return null;
  return {
    edit,
    history: { past: [...history.past, edit], future: history.future.slice(0, -1) },
  };
}
