/**
 * Quick listen (T48): play an idea from the Ideas list without opening it. One idea at a time; the
 * state is tiny (which idea, loading or playing) and the audio goes through the same engine and
 * clip building as the editor's Play from 0:00 (clip gain and fades, track volume, mute / solo; no
 * metronome, no loop). It must stop before the editor's transport starts: the list stops it when it
 * loses focus, goes to the background, or the idea is deleted; the engine reports interruptions.
 */
import { create } from 'zustand';

import {
  play,
  setInterruptionHandler,
  setMetronome,
  setTrackGain,
  stopPlayback,
  type PlayableClip,
} from '@/features/audio/audio-engine';
import { playableClips } from '@/features/audio/playable-clips';
import { hasSolo, trackOutputGain } from '@/features/project/mixer';

import { getProject } from './projects-repo';

export type QuickListenState = {
  /** The idea being listened to; `null` = nothing. */
  ideaId: string | null;
  /** `loading` while the project and audio load; `playing` once it plays (or is about to). */
  status: 'idle' | 'loading' | 'playing';
  /** Where the current run started (seconds), the scrubber's position until the engine reports one. */
  from: number;
};

const IDLE: QuickListenState = { ideaId: null, status: 'idle', from: 0 };

export const useQuickListenStore = create<QuickListenState>()(() => IDLE);

type Loaded = { clips: PlayableClip[]; duration: number };

/** The listened idea's clips, kept so a seek doesn't reload it. */
let loaded: Loaded | null = null;
/** Bumped by every start, seek and stop: a slower, older call sees it changed and gives up. */
let generation = 0;

/** Listens to an idea from 0:00, replacing whatever was playing. */
export async function startQuickListen(ideaId: string): Promise<void> {
  const mine = ++generation;
  stopPlayback();
  loaded = null;
  useQuickListenStore.setState({ ideaId, status: 'loading', from: 0 });
  try {
    const project = await getProject(ideaId);
    if (mine !== generation) return;
    if (!project) {
      reset();
      return;
    }
    const clips = playableClips(project);
    loaded = { clips, duration: project.duration };

    // The editor sets its own gains and metronome when it opens an idea; here the idea's own.
    setMetronome(null);
    const anySolo = hasSolo(project.tracks);
    for (const track of project.tracks) setTrackGain(track.id, trackOutputGain(track, anySolo));
    setInterruptionHandler(() => stopQuickListen());
    await run(0, mine);
  } catch {
    if (mine === generation) reset();
  }
}

/** Plays the listened idea from `time`: the scrubber's drag or tap. */
export async function seekQuickListen(time: number): Promise<void> {
  const { ideaId } = useQuickListenStore.getState();
  if (!ideaId || !loaded) return;
  const mine = ++generation;
  const from = time < loaded.duration ? Math.max(0, time) : 0;
  try {
    await run(from, mine);
  } catch {
    if (mine === generation) reset();
  }
}

/** Stops listening. Safe when nothing plays: it then leaves the engine (and the editor) alone. */
export function stopQuickListen(): void {
  if (useQuickListenStore.getState().ideaId === null) return;
  generation++;
  stopPlayback();
  reset();
}

async function run(from: number, mine: number): Promise<void> {
  if (!loaded) return;
  useQuickListenStore.setState({ status: 'playing', from });
  await play(loaded.clips, {
    from,
    onEnded: () => {
      if (mine === generation) reset();
    },
  });
}

function reset() {
  loaded = null;
  setInterruptionHandler(null);
  useQuickListenStore.setState(IDLE);
}
