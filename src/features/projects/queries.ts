/**
 * TanStack Query hooks over the local projects database, for the Ideas list. The open idea doesn't
 * go through these: the editor store (`@/features/project/editor-store`) loads and edits it, and
 * invalidates the list after each saved change.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { forgetTakes } from '@/features/audio/audio-engine';

import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
} from './projects-repo';

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
};

export function useProjects() {
  return useQuery({ queryKey: projectKeys.list(), queryFn: listProjects });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createProject(name),
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
