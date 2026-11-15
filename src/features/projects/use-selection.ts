import { useState } from 'react';

import type { ItemSelection } from './folder-tree';

export type ItemKind = 'idea' | 'folder';

const EMPTY: ItemSelection = { ideaIds: [], folderIds: [] };

/**
 * Select mode for the Ideas list (T19): which ideas and folders are picked. Its actions (Move, Delete;
 * Export in T37) come from the screen, so later tickets add or change them without touching this.
 */
export function useSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<ItemSelection>(EMPTY);

  const key = (kind: ItemKind) => (kind === 'idea' ? 'ideaIds' : 'folderIds');
  const isSelected = (kind: ItemKind, id: string) => selection[key(kind)].includes(id);

  return {
    selecting,
    selection,
    count: selection.ideaIds.length + selection.folderIds.length,
    isSelected,
    /** Enters select mode, optionally with one item already picked (from a row's menu). */
    start: (item?: { kind: ItemKind; id: string }) => {
      setSelecting(true);
      setSelection(item ? { ...EMPTY, [key(item.kind)]: [item.id] } : EMPTY);
    },
    toggle: (kind: ItemKind, id: string) => {
      setSelection((current) => {
        const ids = current[key(kind)];
        return {
          ...current,
          [key(kind)]: ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
        };
      });
    },
    setAll: (all: ItemSelection) => setSelection(all),
    done: () => {
      setSelecting(false);
      setSelection(EMPTY);
    },
  };
}

export type Selection = ReturnType<typeof useSelection>;
