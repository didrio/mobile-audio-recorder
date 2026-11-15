/** Small projects for the editor's unit tests. */
import type { Clip, Project, Section } from '@/features/projects/projects-repo';

import type { ProjectTrack } from './edit-changes';

export function testClip(id: string, trackId: string, start: number, duration: number): Clip {
  return {
    id,
    trackId,
    takeId: 'take1',
    start,
    offset: 0,
    duration,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

export function testSection(id: string, name: string, start: number, duration: number): Section {
  return { id, projectId: 'p1', name, color: 'blue', start, duration, notes: '' };
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

export function testProject(tracks: ProjectTrack[], sections: Section[] = []): Project {
  const duration = Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)));
  return {
    id: 'p1',
    name: 'Idea 1',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    duration,
    armedTrackId: tracks[0]?.id ?? null,
    preRoll: false,
    snap: true,
    bpm: 120,
    beatsPerBar: 4,
    beatUnit: 4,
    grid: false,
    metronome: false,
    metronomeVolume: 1,
    metronomeOutput: 'both',
    loopOn: false,
    loopRegion: null,
    sections,
    notes: '',
    folderId: null,
    favorite: false,
    takes: {},
    tracks,
  };
}
