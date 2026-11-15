import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';

import type { Delivery, ExportFormat, ExportKind } from './export-plan';

/**
 * The export sheet's choices that are remembered between exports (T36, T37). The range and "Include
 * click" belong to one idea and one moment, so they start fresh each time (whole idea, no click).
 */
type ExportSettings = {
  kind: ExportKind;
  format: ExportFormat;
  normalize: boolean;
  addBpm: boolean;
  applyTrackVolume: boolean;
  includeMuted: boolean;
  clickStem: boolean;
  includeMix: boolean;
  midi: boolean;
  delivery: Delivery;
};

type ExportSettingsState = ExportSettings & {
  set: (changes: Partial<ExportSettings>) => void;
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  kind: 'mix',
  format: 'm4a',
  normalize: true,
  addBpm: false,
  applyTrackVolume: true,
  includeMuted: false,
  clickStem: false,
  includeMix: false,
  midi: true,
  delivery: 'zip',
};

export const useExportSettingsStore = create<ExportSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_EXPORT_SETTINGS,
      set: (changes) => set(changes),
    }),
    {
      name: 'settings.export',
      // New keys get their defaults from the shallow merge, so adding settings needs no migration.
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ set: _set, ...settings }) => settings,
    },
  ),
);
