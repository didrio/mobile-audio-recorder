/**
 * The open idea ("editor store"): the single source of truth for the idea on screen, with undo/redo.
 *
 * - One idea is open at a time (`useOpenIdea` opens it on mount and closes it on unmount). It's loaded
 *   with `getProject`; the Ideas list keeps using TanStack Query, refreshed after each saved change.
 * - Every edit is an `Edit` (`edit-changes.ts`) built by a command (`edit-commands.ts`). `executeEdit`
 *   applies it in memory at once, records it as one undo step and queues the SQLite write. Undo applies
 *   the inverse, redo the edit again. A gesture is one `executeEdit` call, made when it ends.
 * - Writes go through one serial queue, so they land in the order they were made. If one fails, the
 *   later queued writes are skipped, the idea is reloaded from the database and history is cleared, so
 *   memory and disk never disagree.
 * - History (100 steps) lives in memory and is cleared when the idea closes. That's what makes it safe
 *   to delete takes no clip uses when an idea opens.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';

import { forgetTakes } from '@/features/audio/audio-engine';
import {
  deleteUnusedTakes,
  getProject,
  saveChanges,
  setArmedTrack,
  setPreRoll,
  type Project,
  type Take,
} from '@/features/projects/projects-repo';
import { projectKeys } from '@/features/projects/queries';

import { applyToProject, invertEdit, type Change, type Edit } from './edit-changes';
import {
  addTrackEdit,
  deleteClipEdit,
  duplicateClipEdit,
  placeClipEdit,
  recordTakeEdit,
  splitClipEdit,
  type ClipPlacement,
  moveTrackEdit,
  setTrackMutedEdit,
  setTrackSoloEdit,
  setTrackVolumeEdit,
  type RecordedTakeInput,
} from './edit-commands';
import { emptyHistory, pushEdit, redoStep, undoStep, type History } from './edit-history';

export type EditorState = {
  /** The idea that is open (or loading); `null` when none is. */
  projectId: string | null;
  project: Project | null;
  status: 'closed' | 'loading' | 'ready' | 'error';
  history: History;
  /** The track Record records onto; `null` = nothing armed. Saved per idea, but not an undo step. */
  armedTrackId: string | null;
  /** Record starts with a run-up (T25). Saved per idea, but not an undo step. */
  preRoll: boolean;
  /** Set when a change couldn't be saved (the idea was reloaded). */
  saveError: string | null;
};

const closedState: EditorState = {
  projectId: null,
  project: null,
  status: 'closed',
  history: emptyHistory,
  armedTrackId: null,
  preRoll: false,
  saveError: null,
};

export const useEditorStore = create<EditorState>()(() => closedState);

const SAVE_ERROR = 'A change could not be saved, so the idea was reloaded.';

/** Bumped by every open and close, so a slow load can't fill in an idea that is no longer open. */
let session = 0;
/** Bumped when a write fails: writes queued before that are skipped. */
let failures = 0;
let queue: Promise<void> = Promise.resolve();
let onSaved: (() => void) | null = null;

/** Runs `task` after every task queued before it. The returned promise never rejects. */
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch(() => {});
  return queue;
}

/** Queues writing `changes` (and a new take) for the open idea. */
function enqueueWrite(projectId: string, changes: Change[], take?: Take): Promise<void> {
  const failuresAtQueue = failures;
  return enqueue(async () => {
    if (failures !== failuresAtQueue) return; // made on top of a state that was rolled back
    try {
      await saveChanges(projectId, changes, take);
      onSaved?.();
    } catch {
      failures++;
      await reload(projectId);
    }
  });
}

async function reload(projectId: string) {
  const project = await getProject(projectId).catch(() => null);
  const state = useEditorStore.getState();
  if (state.projectId !== projectId) return;
  useEditorStore.setState({
    project: project ?? state.project,
    status: project ? 'ready' : 'error',
    history: emptyHistory,
    armedTrackId: project ? project.armedTrackId : state.armedTrackId,
    preRoll: project ? project.preRoll : state.preRoll,
    saveError: SAVE_ERROR,
  });
}

/** `armedTrackId` if that track is still in `project`, else `null` (deleting the armed track disarms). */
function stillArmed(project: Project, armedTrackId: string | null): string | null {
  return project.tracks.some((track) => track.id === armedTrackId) ? armedTrackId : null;
}

/**
 * Opens an idea: deletes its unused takes, then loads it. `options.onSaved` runs after every saved
 * change (to refresh the Ideas list).
 */
export function openIdea(projectId: string, options: { onSaved?: () => void } = {}): Promise<void> {
  const opened = ++session;
  onSaved = options.onSaved ?? null;
  useEditorStore.setState({ ...closedState, projectId, status: 'loading' });
  // Through the queue, so it sees any write still pending from when the idea was last open.
  return enqueue(async () => {
    try {
      forgetTakes(await deleteUnusedTakes(projectId));
    } catch {
      // Cleanup only; try again next time.
    }
    const project = await getProject(projectId).catch(() => null);
    if (opened !== session) return;
    useEditorStore.setState(
      project
        ? {
            project,
            armedTrackId: project.armedTrackId,
            preRoll: project.preRoll,
            status: 'ready',
          }
        : { status: 'error' },
    );
  });
}

/** Closes the open idea and forgets its history. Writes already queued still land. */
export function closeIdea() {
  session++;
  useEditorStore.setState(closedState);
}

/**
 * Applies `edit` to the open idea as one undo step and saves it. `null` (a command with nothing to
 * do) is ignored. Resolves once saved; failures are handled here (see the file comment).
 */
export function executeEdit(edit: Edit | null): Promise<void> {
  const { project, projectId, history } = useEditorStore.getState();
  if (!edit || !project || !projectId) return Promise.resolve();
  const next = applyToProject(project, edit.changes);
  useEditorStore.setState({
    project: next,
    history: pushEdit(history, edit),
    armedTrackId: stillArmed(next, useEditorStore.getState().armedTrackId),
    saveError: null,
  });
  return enqueueWrite(projectId, edit.changes);
}

export function undo(): Promise<void> {
  const { project, projectId, history } = useEditorStore.getState();
  const step = undoStep(history);
  if (!step || !project || !projectId) return Promise.resolve();
  const inverse = invertEdit(step.edit);
  const next = applyToProject(project, inverse.changes);
  useEditorStore.setState({
    project: next,
    history: step.history,
    armedTrackId: stillArmed(next, useEditorStore.getState().armedTrackId),
    saveError: null,
  });
  return enqueueWrite(projectId, inverse.changes);
}

export function redo(): Promise<void> {
  const { project, projectId, history } = useEditorStore.getState();
  const step = redoStep(history);
  if (!step || !project || !projectId) return Promise.resolve();
  const next = applyToProject(project, step.edit.changes);
  useEditorStore.setState({
    project: next,
    history: step.history,
    armedTrackId: stillArmed(next, useEditorStore.getState().armedTrackId),
    saveError: null,
  });
  return enqueueWrite(projectId, step.edit.changes);
}

/** Adds a track after the last one and arms it. */
export function addTrack(): Promise<void> {
  const { project } = useEditorStore.getState();
  if (!project) return Promise.resolve();
  const { edit, trackId } = addTrackEdit(project);
  const saved = executeEdit(edit);
  const armed = armTrack(trackId);
  return Promise.all([saved, armed]).then(() => {});
}

/** Sets a track's volume (linear gain) as one undo step: call it once, when a fader drag ends. */
export function setTrackVolume(trackId: string, volume: number): Promise<void> {
  const { project } = useEditorStore.getState();
  if (!project) return Promise.resolve();
  return executeEdit(setTrackVolumeEdit(project, trackId, volume));
}

/** Mutes or unmutes a track (one undo step). */
export function toggleMute(trackId: string): Promise<void> {
  const { project } = useEditorStore.getState();
  const track = project?.tracks.find((candidate) => candidate.id === trackId);
  if (!project || !track) return Promise.resolve();
  return executeEdit(setTrackMutedEdit(project, trackId, !track.muted));
}

/** Solos or unsolos a track (one undo step); several tracks can be soloed. */
export function toggleSolo(trackId: string): Promise<void> {
  const { project } = useEditorStore.getState();
  const track = project?.tracks.find((candidate) => candidate.id === trackId);
  if (!project || !track) return Promise.resolve();
  return executeEdit(setTrackSoloEdit(project, trackId, !track.solo));
}

/** Moves a track to index `toIndex` in the track order (one undo step, made when a drag ends). */
export function moveTrack(trackId: string, toIndex: number): Promise<void> {
  const { project } = useEditorStore.getState();
  if (!project) return Promise.resolve();
  return executeEdit(moveTrackEdit(project, trackId, toIndex));
}

/**
 * Moves and/or trims a clip as one undo step (made when the drag ends); it replaces what it lands on.
 * Returns whether anything changed.
 */
export function placeClip(clipId: string, placement: ClipPlacement, label?: string): boolean {
  const { project } = useEditorStore.getState();
  const edit = project ? placeClipEdit(project, clipId, placement, label) : null;
  void executeEdit(edit);
  return edit != null;
}

/** Splits a clip at timeline position `at`. Returns the new (tail) clip's id, or `null`. */
export function splitClip(clipId: string, at: number): string | null {
  const { project } = useEditorStore.getState();
  const result = project ? splitClipEdit(project, clipId, at) : null;
  void executeEdit(result?.edit ?? null);
  return result?.tailId ?? null;
}

/** Copies a clip to right after itself. Returns the copy's id, or `null`. */
export function duplicateClip(clipId: string): string | null {
  const { project } = useEditorStore.getState();
  const result = project ? duplicateClipEdit(project, clipId) : null;
  void executeEdit(result?.edit ?? null);
  return result?.copyId ?? null;
}

export function deleteClip(clipId: string): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? deleteClipEdit(project, clipId) : null);
}

/** Arms `trackId` (disarming the previous one), or disarms everything with `null`. Saved, not undoable. */
export function armTrack(trackId: string | null): Promise<void> {
  const { projectId } = useEditorStore.getState();
  useEditorStore.setState({ armedTrackId: trackId });
  if (!projectId) return Promise.resolve();
  // Through the queue so a track added just before is written first. A failure only loses the arming.
  return enqueue(() => setArmedTrack(projectId, trackId));
}

/** The pre-roll toggle in the status strip. Saved, not undoable. */
export function togglePreRoll(): Promise<void> {
  const { projectId, preRoll } = useEditorStore.getState();
  useEditorStore.setState({ preRoll: !preRoll });
  if (!projectId) return Promise.resolve();
  return enqueue(() => setPreRoll(projectId, !preRoll));
}

/** Tapping a track's name: arms it, or disarms it when it is the armed one. */
export function toggleArm(trackId: string): Promise<void> {
  return armTrack(useEditorStore.getState().armedTrackId === trackId ? null : trackId);
}

export type RecordTakeInput = Omit<RecordedTakeInput, 'take'> & {
  projectId: string;
  take: Pick<Take, 'id' | 'path' | 'duration' | 'sampleRate' | 'channels'>;
};

/**
 * Saves a recorded take and places it on its track (one undo step). Recording can finish after the
 * idea was closed (leaving the screen stops and saves it), so a take for an idea that isn't open (or
 * not loaded yet) is placed against the database instead, without history. Rejects only in that case.
 */
export function recordTake(input: RecordTakeInput): Promise<void> {
  const take: Take = { ...input.take, projectId: input.projectId, createdAt: Date.now() };
  const changes = placeInOpenIdea(input, take);
  if (changes) return enqueueWrite(input.projectId, changes, take);

  let failed: unknown = null;
  const saved = enqueue(async () => {
    // Inside the queue, so a load that was pending has finished by now.
    const placed = placeInOpenIdea(input, take);
    try {
      if (placed) {
        await saveChanges(input.projectId, placed, take);
      } else {
        const project = await getProject(input.projectId);
        if (!project) return;
        await saveChanges(input.projectId, recordTakeEdit(project, input)?.changes ?? [], take);
      }
      onSaved?.();
    } catch (cause) {
      if (placed) {
        failures++;
        await reload(input.projectId);
      } else {
        failed = cause;
      }
    }
  });
  return saved.then(() => {
    if (failed) throw failed;
  });
}

/**
 * Adds the take to the open idea in memory and places its clip (one undo step), if `input` is for
 * the open, loaded idea. Returns the changes to save, or `null` when the idea isn't open.
 */
function placeInOpenIdea(input: RecordTakeInput, take: Take): Change[] | null {
  const { project, projectId, history } = useEditorStore.getState();
  if (!project || projectId !== input.projectId) return null;
  const edit = recordTakeEdit(project, input);
  const withTake = { ...project, takes: { ...project.takes, [take.id]: take } };
  useEditorStore.setState({
    project: edit ? applyToProject(withTake, edit.changes) : withTake,
    history: edit ? pushEdit(history, edit) : history,
    saveError: null,
  });
  return edit?.changes ?? [];
}

// Selectors

/** The armed track, or `undefined` when nothing is armed. */
export function selectArmedTrack(state: EditorState) {
  return state.project?.tracks.find((track) => track.id === state.armedTrackId);
}

export const selectCanUndo = (state: EditorState) => state.history.past.length > 0;
export const selectCanRedo = (state: EditorState) => state.history.future.length > 0;

/** Opens idea `projectId` while the calling screen is mounted. */
export function useOpenIdea(projectId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    void openIdea(projectId, {
      onSaved: () => void queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
    });
    return closeIdea;
  }, [projectId, queryClient]);
}
