import { forgetTakes } from '@/features/audio/audio-engine';
import { deleteUnusedTakes, getProject, saveChanges } from '@/features/projects/projects-repo';

import { renameTrackEdit } from './edit-commands';
import { testClip, testProject, testTrack } from './edit-test-data';
import {
  addTrack,
  closeIdea,
  executeEdit,
  openIdea,
  recordTake,
  redo,
  selectArmedTrack,
  selectCanRedo,
  selectCanUndo,
  undo,
  useEditorStore,
} from './editor-store';

jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));
jest.mock('@/features/projects/projects-repo', () => ({
  getProject: jest.fn(),
  saveChanges: jest.fn(),
  deleteUnusedTakes: jest.fn(),
}));

const project = testProject([testTrack('a', 0, [testClip('c1', 'a', 0, 10)]), testTrack('b', 1)]);

const take = { id: 'take2', path: 'p.wav', duration: 2, sampleRate: 48000, channels: 1 };

const state = () => useEditorStore.getState();
const trackNames = () => state().project?.tracks.map((t) => t.name);
const savedNames = () =>
  jest
    .mocked(saveChanges)
    .mock.calls.map(([, changes]) =>
      changes.map((c) => (c.table === 'tracks' ? c.after?.name : c.after?.takeId)),
    );

describe('editor store', () => {
  beforeEach(async () => {
    jest.mocked(getProject).mockResolvedValue(project);
    jest.mocked(saveChanges).mockResolvedValue();
    jest.mocked(deleteUnusedTakes).mockResolvedValue(['old.wav']);
    await openIdea('p1');
  });

  afterEach(() => closeIdea());

  it('deletes unused takes, then loads the idea', () => {
    expect(forgetTakes).toHaveBeenCalledWith(['old.wav']);
    expect(state()).toMatchObject({ projectId: 'p1', status: 'ready', project });
    expect(selectArmedTrack(state())?.id).toBe('a');
  });

  it('applies an edit at once, saves it, and undoes and redoes it', async () => {
    const onSaved = jest.fn();
    await openIdea('p1', { onSaved });

    const saved = executeEdit(renameTrackEdit(project, 'b', 'Bass'));
    expect(trackNames()).toEqual(['Track 1', 'Bass']);
    expect(selectCanUndo(state())).toBe(true);
    await saved;
    expect(onSaved).toHaveBeenCalledTimes(1);

    await undo();
    expect(trackNames()).toEqual(['Track 1', 'Track 2']);
    expect(selectCanRedo(state())).toBe(true);

    await redo();
    expect(trackNames()).toEqual(['Track 1', 'Bass']);
    expect(savedNames()).toEqual([['Bass'], ['Track 2'], ['Bass']]);
  });

  it('adds a track and arms it', async () => {
    await addTrack();

    expect(trackNames()).toEqual(['Track 1', 'Track 2', 'Track 3']);
    expect(selectArmedTrack(state())?.name).toBe('Track 3');
    await undo();
    expect(selectArmedTrack(state())?.name).toBe('Track 1'); // falls back to the first track
  });

  it('records a take as one undo step, saving the take with its clip', async () => {
    await recordTake({ projectId: 'p1', trackId: 'b', start: 3, take });

    expect(state().project?.takes.take2).toMatchObject({ path: 'p.wav', projectId: 'p1' });
    expect(state().project?.tracks[1]?.clips).toEqual([
      expect.objectContaining({ takeId: 'take2', start: 3, duration: 2 }),
    ]);
    expect(saveChanges).toHaveBeenLastCalledWith(
      'p1',
      [expect.objectContaining({ table: 'clips', before: null })],
      expect.objectContaining({ id: 'take2' }),
    );

    await undo();
    expect(state().project?.tracks[1]?.clips).toEqual([]);
  });

  it('still saves a take that finishes recording after the idea closed', async () => {
    closeIdea();

    await recordTake({ projectId: 'p1', trackId: 'a', start: 4, take });

    expect(getProject).toHaveBeenLastCalledWith('p1');
    expect(saveChanges).toHaveBeenLastCalledWith(
      'p1',
      expect.arrayContaining([expect.objectContaining({ table: 'clips', before: null })]),
      expect.objectContaining({ id: 'take2' }),
    );
    expect(state().project).toBeNull();
  });

  it('reloads the idea and clears history when a change cannot be saved', async () => {
    jest.mocked(saveChanges).mockRejectedValueOnce(new Error('disk full'));

    const first = executeEdit(renameTrackEdit(project, 'b', 'Bass'));
    const second = executeEdit(renameTrackEdit(project, 'a', 'Drums'));
    await Promise.all([first, second]);

    expect(saveChanges).toHaveBeenCalledTimes(1); // the second edit was made on top of the first
    expect(trackNames()).toEqual(['Track 1', 'Track 2']);
    expect(selectCanUndo(state())).toBe(false);
    expect(state().saveError).toMatch(/could not be saved/);
  });

  it('forgets history when the idea closes', async () => {
    await executeEdit(renameTrackEdit(project, 'b', 'Bass'));
    closeIdea();
    await openIdea('p1');

    expect(selectCanUndo(state())).toBe(false);
  });
});
