/** Small projects for the editor's unit tests. */
import type { Clip, Project } from '@/features/projects/projects-repo';

import type { ProjectTrack } from './edit-changes';

export function testClip(id: string, trackId: string, start: number, duration: number): Clip {
  return { id, trackId, takeId: 'take1', start, offset: 0, duration };
}

export function testTrack(id: string, position: number, clips: Clip[] = []): ProjectTrack {
  return {
    id,
    projectId: 'p1',
    position,
    name: `Track ${position + 1}`,
    volume: 1,
    muted: false,
    solo: false,
    clips,
  };
}

export function testProject(tracks: ProjectTrack[]): Project {
  const duration = Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)));
  return { id: 'p1', name: 'Idea 1', createdAt: 0, updatedAt: 0, duration, takes: {}, tracks };
}
