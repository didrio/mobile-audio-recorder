import { applyToProject, invertEdit } from './edit-changes';
import {
  addTrackEdit,
  deleteTrackEdit,
  moveTrackEdit,
  recordTakeEdit,
  renameTrackEdit,
  setTrackMutedEdit,
  setTrackSoloEdit,
  setTrackVolumeEdit,
} from './edit-commands';
import { testClip, testProject, testTrack } from './edit-test-data';

const project = testProject([
  testTrack('a', 0, [testClip('c1', 'a', 0, 10)]),
  testTrack('b', 1, [testClip('c2', 'b', 2, 3)]),
]);

const undo = (edit: { changes: Parameters<typeof applyToProject>[1]; label: string }) =>
  applyToProject(applyToProject(project, edit.changes), invertEdit(edit).changes);

describe('addTrackEdit', () => {
  it('adds "Track N" after the last track, and undo removes it', () => {
    const { edit, trackId } = addTrackEdit(project);
    const after = applyToProject(project, edit.changes);

    expect(after.tracks.at(-1)).toMatchObject({ id: trackId, name: 'Track 3', position: 2 });
    expect(undo(edit)).toEqual(project);
  });
});

describe('renameTrackEdit', () => {
  it('renames a track (trimmed), and undo restores the old name', () => {
    const edit = renameTrackEdit(project, 'b', '  Vocals ')!;

    expect(applyToProject(project, edit.changes).tracks[1]?.name).toBe('Vocals');
    expect(undo(edit)).toEqual(project);
  });

  it('ignores empty and unchanged names', () => {
    expect(renameTrackEdit(project, 'b', '  ')).toBeNull();
    expect(renameTrackEdit(project, 'b', 'Track 2')).toBeNull();
  });
});

describe('moveTrackEdit', () => {
  const four = testProject([
    testTrack('a', 0, [testClip('c1', 'a', 0, 10)]),
    testTrack('b', 1),
    testTrack('c', 2),
    testTrack('d', 3),
  ]);
  const order = (p: typeof four) => p.tracks.map((track) => track.id).join('');

  it('moves a track down, and undo restores the order', () => {
    const edit = moveTrackEdit(four, 'a', 2)!;
    const after = applyToProject(four, edit.changes);

    expect(order(after)).toBe('bcad');
    expect(after.tracks.map((track) => track.position)).toEqual([0, 1, 2, 3]);
    expect(after.tracks[2]?.clips).toHaveLength(1);
    expect(edit.changes.map((change) => change.id)).toEqual(['b', 'c', 'a']);
    expect(applyToProject(after, invertEdit(edit).changes)).toEqual(four);
  });

  it('moves a track up', () => {
    const edit = moveTrackEdit(four, 'd', 0)!;
    expect(order(applyToProject(four, edit.changes))).toBe('dabc');
  });

  it('reuses the existing positions when they have gaps', () => {
    const gaps = testProject([testTrack('a', 0), testTrack('b', 3), testTrack('c', 7)]);
    const after = applyToProject(gaps, moveTrackEdit(gaps, 'c', 0)!.changes);

    expect(order(after)).toBe('cab');
    expect(after.tracks.map((track) => track.position)).toEqual([0, 3, 7]);
  });

  it('clamps the target and ignores no-ops and unknown tracks', () => {
    expect(order(applyToProject(four, moveTrackEdit(four, 'b', 99)!.changes))).toBe('acdb');
    expect(moveTrackEdit(four, 'b', 1)).toBeNull();
    expect(moveTrackEdit(four, 'zz', 0)).toBeNull();
  });
});

describe('setTrackVolumeEdit', () => {
  it('sets the volume, and undo restores it', () => {
    const edit = setTrackVolumeEdit(project, 'a', 0.5)!;

    expect(applyToProject(project, edit.changes).tracks[0]?.volume).toBe(0.5);
    expect(undo(edit)).toEqual(project);
  });

  it('ignores unchanged, negative and unknown values', () => {
    expect(setTrackVolumeEdit(project, 'a', 1)).toBeNull();
    expect(setTrackVolumeEdit(project, 'a', -1)).toBeNull();
    expect(setTrackVolumeEdit(project, 'a', Number.NaN)).toBeNull();
    expect(setTrackVolumeEdit(project, 'zzz', 0.5)).toBeNull();
  });
});

describe('setTrackMutedEdit / setTrackSoloEdit', () => {
  it('mutes and solos a track, and undo restores it', () => {
    const mute = setTrackMutedEdit(project, 'a', true)!;
    const solo = setTrackSoloEdit(project, 'b', true)!;

    expect(applyToProject(project, mute.changes).tracks[0]?.muted).toBe(true);
    expect(applyToProject(project, solo.changes).tracks[1]?.solo).toBe(true);
    expect(undo(mute)).toEqual(project);
    expect(setTrackMutedEdit(project, 'a', false)).toBeNull();
  });
});

describe('deleteTrackEdit', () => {
  it('deletes the track and its clips, and undo restores both', () => {
    const edit = deleteTrackEdit(project, 'b')!;

    expect(applyToProject(project, edit.changes).tracks.map((t) => t.id)).toEqual(['a']);
    expect(edit.changes.map((c) => c.id)).toEqual(['c2', 'b']);
    expect(undo(edit)).toEqual(project);
  });

  it('keeps the last track', () => {
    expect(deleteTrackEdit(testProject([testTrack('a', 0)]), 'a')).toBeNull();
  });
});

describe('recordTakeEdit', () => {
  const take = { id: 'take2', duration: 3 };

  it('adds the clip from the offset to the end of the take', () => {
    const edit = recordTakeEdit(project, { trackId: 'b', take, start: 6, offset: 0.5 })!;
    const clips = applyToProject(project, edit.changes).tracks[1]?.clips;

    expect(clips?.at(-1)).toMatchObject({ takeId: 'take2', start: 6, offset: 0.5, duration: 2.5 });
  });

  it('splits a clip it lands in the middle of, and undo restores the clip whole', () => {
    const edit = recordTakeEdit(project, { trackId: 'a', take, start: 4 })!;
    const clips = applyToProject(project, edit.changes).tracks[0]?.clips;

    expect(clips?.map((c) => [c.takeId, c.start, c.offset, c.duration])).toEqual([
      ['take1', 0, 0, 4],
      ['take2', 4, 0, 3],
      ['take1', 7, 7, 3],
    ]);
    expect(undo(edit)).toEqual(project);
  });

  it('replaces clips it covers completely', () => {
    const edit = recordTakeEdit(project, {
      trackId: 'b',
      take: { id: 'take2', duration: 8 },
      start: 1,
    })!;
    const clips = applyToProject(project, edit.changes).tracks[1]?.clips;

    expect(clips?.map((c) => c.takeId)).toEqual(['take2']);
    expect(undo(edit)).toEqual(project);
  });

  it('does nothing for a track that is gone', () => {
    expect(recordTakeEdit(project, { trackId: 'x', take, start: 0 })).toBeNull();
  });
});
