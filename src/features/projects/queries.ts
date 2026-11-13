/**
 * TanStack Query hooks over the local projects database. Reads are cached per key; mutations
 * invalidate what they change, so lists and the open project stay in sync.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { forgetTakes } from '@/features/audio/audio-engine';

import {
  addTakeWithClip,
  addTrack,
  createProject,
  deleteProject,
  deleteTrack,
  getProject,
  listProjects,
  renameTrack,
} from './projects-repo';

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
};

export function useProjects() {
  return useQuery({ queryKey: projectKeys.list(), queryFn: listProjects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createProject(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
  });
}

/** Refreshes the open project and the list after a change to `projectId`. */
function useInvalidateProject() {
  const queryClient = useQueryClient();
  return (projectId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
    ]);
}

export function useAddTake() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (input: Parameters<typeof addTakeWithClip>[0]) => addTakeWithClip(input),
    onSuccess: (_result, input) => invalidate(input.projectId),
  });
}

export function useAddTrack() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (projectId: string) => addTrack(projectId),
    onSuccess: (_track, projectId) => invalidate(projectId),
  });
}

export function useRenameTrack() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (input: Parameters<typeof renameTrack>[0]) => renameTrack(input),
    onSuccess: (_result, input) => invalidate(input.projectId),
  });
}

export function useDeleteTrack() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteTrack>[0]) => deleteTrack(input),
    onSuccess: (_result, input) => invalidate(input.projectId),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: (takePaths, id) => {
      forgetTakes(takePaths);
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}
