import type { PlayableClip } from './audio-engine';

/** The parts of a project the engine needs: structural, so the editor and the Ideas list share it. */
type PlayableProject = {
  tracks: {
    id: string;
    clips: {
      takeId: string;
      start: number;
      offset: number;
      duration: number;
      gain: number;
      fadeIn: number;
      fadeOut: number;
    }[];
  }[];
  takes: Record<string, { path: string } | undefined>;
};

/**
 * The project's clips as the engine plays them, from the tracks that pass `include`. Clips whose
 * take is missing are left out. Shared by the editor's transport and the Ideas list's quick listen.
 */
export function playableClips<Project extends PlayableProject>(
  project: Project,
  include: (track: Project['tracks'][number]) => boolean = () => true,
): PlayableClip[] {
  return project.tracks.filter(include).flatMap((track) =>
    track.clips.flatMap((clip) => {
      const take = project.takes[clip.takeId];
      return take
        ? [
            {
              takePath: take.path,
              trackId: track.id,
              start: clip.start,
              offset: clip.offset,
              duration: clip.duration,
              gain: clip.gain,
              fadeIn: clip.fadeIn,
              fadeOut: clip.fadeOut,
            },
          ]
        : [];
    }),
  );
}
