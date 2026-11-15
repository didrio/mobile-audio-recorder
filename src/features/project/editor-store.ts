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
import { defaultLoopRegion, type LoopRegion } from '@/features/audio/loop-math';
import {
  deleteUnusedTakes,
  getProject,
  saveChanges,
  setArmedTrack,
  setMetronome,
  setLoop,
  setPreRoll,
  setProjectNotes,
  setSnap,
  type IdeaSettings,
  type Project,
  type Take,
} from '@/features/projects/projects-repo';
import { projectKeys } from '@/features/projects/queries';
import { dbToGain, MAX_DB } from '@/features/timeline/fader-math';

import { applyToProject, invertEdit, type Change, type Edit } from './edit-changes';
import {
  addSectionEdit,
  addTrackEdit,
  deleteClipEdit,
  deleteSectionEdit,
  placeSectionEdit,
  renameSectionEdit,
  setSectionColorEdit,
  setSectionNotesEdit,
  type NewSection,
  duplicateClipEdit,
  placeClipEdit,
  recordTakeEdit,
  restoreClipEdit,
  setClipOptionsEdit,
  setIdeaSettingsEdit,
  type ClipOptions,
  splitClipEdit,
  type ClipPlacement,
  moveTrackEdit,
  setTrackMutedEdit,
  setTrackSoloEdit,
  setTrackVolumeEdit,
  type RecordedTakeInput,
} from './edit-commands';
import { emptyHistory, pushEdit, redoStep, undoStep, type History } from './edit-history';
import type { SectionColor } from './sections';

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
  /** Snap clips and the playhead to the grid (T31). Saved per idea, but not an undo step. */
  snap: boolean;
  /** The metronome toggle (T17). Saved per idea, but not an undo step. */
  metronome: boolean;
  /** The Loop toggle and region (T26). Saved per idea, but not undo steps (like the playhead). */
  loopOn: boolean;
  loopRegion: LoopRegion | null;
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
  snap: true,
  metronome: false,
  loopOn: false,
  loopRegion: null,
  saveError: null,
};

export const useEditorStore = create<EditorState>()(() => closedState);

const SAVE_ERROR = 'A change could not be saved, so the idea was reloaded.';
const NOTES_SAVE_ERROR = 'The notes could not be saved.';

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
    snap: project ? project.snap : state.snap,
    metronome: project ? project.metronome : state.metronome,
    loopOn: project ? project.loopOn : state.loopOn,
    loopRegion: project ? project.loopRegion : state.loopRegion,
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
            snap: project.snap,
            metronome: project.metronome,
            loopOn: project.loopOn,
            loopRegion: project.loopRegion,
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

/** Changes the idea's settings (name, tempo, meter, grid, metronome volume) as one undo step (see the command). */
export function setIdeaSettings(patch: Partial<IdeaSettings>): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? setIdeaSettingsEdit(project, patch) : null);
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

/**
 * Changes a clip's gain and/or fades (T16) as one undo step. Gain is capped at the fader's top
 * (`MAX_DB`). Returns whether anything changed.
 */
export function setClipOptions(
  clipId: string,
  patch: Partial<ClipOptions>,
  label?: string,
): boolean {
  const { project } = useEditorStore.getState();
  const edit = project
    ? setClipOptionsEdit(project, clipId, patch, { label, maxGain: dbToGain(MAX_DB) })
    : null;
  void executeEdit(edit);
  return edit != null;
}

/** "Restore full take" (T16): the clip grows back towards its whole take. Returns whether it changed. */
export function restoreClip(clipId: string): boolean {
  const { project } = useEditorStore.getState();
  const edit = project ? restoreClipEdit(project, clipId) : null;
  void executeEdit(edit);
  return edit != null;
}

export function deleteClip(clipId: string): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? deleteClipEdit(project, clipId) : null);
}

/** Adds a section label (one undo step). Returns its id, or `null` when it doesn't fit. */
export function addSection(input: NewSection): string | null {
  const { project } = useEditorStore.getState();
  const result = project ? addSectionEdit(project, input) : null;
  void executeEdit(result?.edit ?? null);
  return result?.sectionId ?? null;
}

/** Moves and/or resizes a section as one undo step (made when the drag ends). Returns whether it changed. */
export function placeSection(
  sectionId: string,
  window: { start: number; duration: number },
  label?: string,
): boolean {
  const { project } = useEditorStore.getState();
  const edit = project ? placeSectionEdit(project, sectionId, window, label) : null;
  void executeEdit(edit);
  return edit != null;
}

export function renameSection(sectionId: string, name: string): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? renameSectionEdit(project, sectionId, name) : null);
}

export function setSectionColor(sectionId: string, color: SectionColor): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? setSectionColorEdit(project, sectionId, color) : null);
}

export function setSectionNotes(sectionId: string, notes: string): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? setSectionNotesEdit(project, sectionId, notes) : null);
}

export function deleteSection(sectionId: string): Promise<void> {
  const { project } = useEditorStore.getState();
  return executeEdit(project ? deleteSectionEdit(project, sectionId) : null);
}

/**
 * Replaces the idea's notes (T24) in memory and saves them. Not an undo step (the text field has its
 * own undo), so the notes sheet calls it debounced while typing and once more when it closes.
 */
export function setIdeaNotes(notes: string): Promise<void> {
  const { project, projectId } = useEditorStore.getState();
  if (!project || !projectId || project.notes === notes) return Promise.resolve();
  useEditorStore.setState({ project: { ...project, notes } });
  return enqueue(() =>
    setProjectNotes(projectId, notes).then(
      () => onSaved?.(),
      () => {
        if (useEditorStore.getState().projectId === projectId) {
          useEditorStore.setState({ saveError: NOTES_SAVE_ERROR });
        }
      },
    ),
  );
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

/** The Snap toggle in the status strip. Saved, not undoable. */
export function toggleSnap(): Promise<void> {
  const { projectId, snap } = useEditorStore.getState();
  useEditorStore.setState({ snap: !snap });
  if (!projectId) return Promise.resolve();
  return enqueue(() => setSnap(projectId, !snap));
}

/**
 * The metronome toggle in the status strip. Saved, not undoable. Turning it on also turns the grid on
 * (that part is an Idea settings edit, so one undo step when the grid was off).
 */
export function toggleMetronome(): Promise<void> {
  const { projectId, metronome, project } = useEditorStore.getState();
  const on = !metronome;
  useEditorStore.setState({ metronome: on });
  const grid = on && project && !project.grid ? setIdeaSettings({ grid: true }) : Promise.resolve();
  if (!projectId) return grid;
  return Promise.all([grid, enqueue(() => setMetronome(projectId, on))]).then(() => {});
}

/**
 * The Loop toggle in the transport. Saved, not undoable. Turning it on without a region makes one
 * at the playhead (`defaultLoopRegion`: two bars with the grid on, else 8 s).
 */
export function toggleLoop(playhead: number): Promise<void> {
  const { projectId, project, loopOn, loopRegion } = useEditorStore.getState();
  const on = !loopOn;
  const region =
    on && !loopRegion && project
      ? defaultLoopRegion(playhead, { grid: project.grid, meter: project })
      : loopRegion;
  useEditorStore.setState({ loopOn: on, loopRegion: region });
  if (!projectId) return Promise.resolve();
  return enqueue(() => setLoop(projectId, on, region));
}

/** Moves or resizes the loop region (a handle drag on the ruler). Saved, not undoable. */
export function setLoopRegion(region: LoopRegion): Promise<void> {
  const { projectId, loopOn } = useEditorStore.getState();
  useEditorStore.setState({ loopRegion: region });
  if (!projectId) return Promise.resolve();
  return enqueue(() => setLoop(projectId, loopOn, region));
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
