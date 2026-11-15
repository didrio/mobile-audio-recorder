/**
 * TanStack Query hooks over the local projects database, for the Ideas list. The open idea doesn't
 * go through these: the editor store (`@/features/project/editor-store`) loads and edits it, and
 * invalidates the list after each saved change.
 *
 * The Ideas tab loads every idea and every folder (T19) and derives each view with `./folder-tree.ts`.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { forgetTakes } from '@/features/audio/audio-engine';

import type { ItemSelection } from './folder-tree';
import { createFolder, deleteItems, listFolders, moveItems, renameFolder } from './folders-repo';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  setFavorite,
} from './projects-repo';

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  folders: () => [...projectKeys.all, 'folders'] as const,
};

const invalidateLists = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
    queryClient.invalidateQueries({ queryKey: projectKeys.folders() }),
  ]);

export function useProjects() {
  return useQuery({ queryKey: projectKeys.list(), queryFn: listProjects });
}

/** Whether an idea is starred, read from the list (not the editor store: starring isn't an edit). */
export function useIsFavorite(id: string) {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: listProjects,
    select: (ideas) => ideas.find((idea) => idea.id === id)?.favorite ?? false,
  });
}

export function useFolders() {
  return useQuery({ queryKey: projectKeys.folders(), queryFn: listFolders });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options?: { name?: string; grid?: boolean; folderId?: string | null }) =>
      createProject(options),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: (takePaths) => {
      forgetTakes(takePaths);
      return queryClient.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}

export function useRenameProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameProject(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
  });
}

export function useDuplicateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
  });
}

export function useSetFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, favorite }: { ids: readonly string[]; favorite: boolean }) =>
      setFavorite(ids, favorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, name }: { parentId: string | null; name: string }) =>
      createFolder(parentId, name),
    onSuccess: () => invalidateLists(queryClient),
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: () => invalidateLists(queryClient),
  });
}

export function useMoveItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ selection, targetId }: { selection: ItemSelection; targetId: string | null }) =>
      moveItems(selection, targetId),
    onSuccess: () => invalidateLists(queryClient),
  });
}

export function useDeleteItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selection: ItemSelection) => deleteItems(selection),
    onSuccess: (takePaths) => {
      forgetTakes(takePaths);
      return invalidateLists(queryClient);
    },
  });
}
