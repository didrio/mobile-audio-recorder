import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

import { isSortOrder, type SortOrder } from './ideas-list';

type IdeasSortState = {
  order: SortOrder;
  setOrder: (order: SortOrder) => void;
};

/** The Ideas list's sort choice, remembered across launches. */
export const useIdeasSortStore = create<IdeasSortState>()(
  persist(
    (set) => ({
      order: 'recent',
      setOrder: (order) => set({ order }),
    }),
    {
      name: 'ideas.sort',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ order: state.order }),
      merge: (persisted, current) => {
        const order = (persisted as Partial<IdeasSortState> | undefined)?.order;
        return { ...current, order: isSortOrder(order) ? order : current.order };
      },
    },
  ),
);
