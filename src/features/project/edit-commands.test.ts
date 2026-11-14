import type { Project } from '@/features/projects/projects-repo';

import { applyToProject, invertEdit } from './edit-changes';
import {
  addTrackEdit,
  deleteClipEdit,
  deleteTrackEdit,
  duplicateClipEdit,
  MIN_CLIP_SECONDS,
  placeClipEdit,
  splitClipEdit,
  moveTrackEdit,
  recordTakeEdit,
  renameTrackEdit,
  setIdeaSettingsEdit,
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

describe('setIdeaSettingsEdit', () => {
  it('changes the time signature, name and grid together, and undo restores them', () => {
    const edit = setIdeaSettingsEdit(project, {
      name: '  Demo  ',
      beatsPerBar: 6,
      beatUnit: 8,
      grid: true,
    })!;
    const after = applyToProject(project, edit.changes);
    expect(after).toMatchObject({
      name: 'Demo',
      beatsPerBar: 6,
      beatUnit: 8,
      grid: true,
      bpm: 120,
    });
    expect(undo(edit)).toEqual(project);
  });

  it('turns the grid on when the tempo changes, unless told otherwise', () => {
    const edit = setIdeaSettingsEdit(project, { bpm: 90 })!;
    expect(applyToProject(project, edit.changes)).toMatchObject({ bpm: 90, grid: true });
    const off = setIdeaSettingsEdit(project, { bpm: 90, grid: false })!;
    expect(applyToProject(project, off.changes)).toMatchObject({ bpm: 90, grid: false });
  });

  it('clamps the tempo and keeps the grid as it was when the tempo is unchanged', () => {
    const gridOff = setIdeaSettingsEdit(project, { bpm: 1000 })!;
    expect(applyToProject(project, gridOff.changes).bpm).toBe(240);
    expect(setIdeaSettingsEdit(project, { bpm: 120 })).toBeNull();
  });

  it('sets the metronome volume (never below silence), and undo restores it', () => {
    const edit = setIdeaSettingsEdit(project, { metronomeVolume: 0.5 })!;
    expect(applyToProject(project, edit.changes)).toMatchObject({
      metronomeVolume: 0.5,
      grid: false,
    });
    expect(undo(edit)).toEqual(project);
    const negative = setIdeaSettingsEdit(project, { metronomeVolume: -1 })!;
    expect(applyToProject(project, negative.changes).metronomeVolume).toBe(0);
    expect(setIdeaSettingsEdit(project, { metronomeVolume: 1 })).toBeNull();
    expect(setIdeaSettingsEdit(project, { metronomeVolume: Number.NaN })).toBeNull();
  });

  it('ignores a blank name and does nothing when nothing changes', () => {
    expect(setIdeaSettingsEdit(project, { name: '   ' })).toBeNull();
    expect(setIdeaSettingsEdit(project, { name: 'Idea 1', grid: false })).toBeNull();
    expect(setIdeaSettingsEdit(project, {})).toBeNull();
  });
});

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

describe('clip edits', () => {
  // Take 'take1' is 20 s long. Track a: c1 at 0…10 (take 0…10), c3 at 12…16 (take 12…16).
  const take = {
    id: 'take1',
    projectId: 'p1',
    path: 'takes/take1.m4a',
    duration: 20,
    sampleRate: 48000,
    channels: 1,
    createdAt: 0,
  };
  const c3 = { ...testClip('c3', 'a', 12, 4), offset: 12 };
  const clips: Project = {
    ...testProject([
      testTrack('a', 0, [testClip('c1', 'a', 0, 10), c3]),
      testTrack('b', 1, [testClip('c2', 'b', 2, 3)]),
    ]),
    takes: { take1: take },
  };
  const undoClips = (edit: { changes: Parameters<typeof applyToProject>[1]; label: string }) =>
    applyToProject(applyToProject(clips, edit.changes), invertEdit(edit).changes);
  const clipsOf = (p: typeof clips, trackId: string) =>
    p.tracks
      .find((track) => track.id === trackId)!
      .clips.map(({ id, start, offset, duration }) => ({
        id,
        start,
        offset,
        duration,
      }));

  describe('placeClipEdit', () => {
    it('moves a clip in time, and undo puts it back', () => {
      const edit = placeClipEdit(clips, 'c2', { trackId: 'b', start: 6, offset: 0, duration: 3 })!;

      expect(clipsOf(applyToProject(clips, edit.changes), 'b')).toEqual([
        { id: 'c2', start: 6, offset: 0, duration: 3 },
      ]);
      expect(undoClips(edit)).toEqual(clips);
    });

    it('moves a clip to another track, replacing what it lands on; undo restores both', () => {
      // c2 (3 s) dropped at 8 s on track a: covers c1's tail (8…10), c3 is untouched (starts at 12).
      const edit = placeClipEdit(clips, 'c2', { trackId: 'a', start: 8, offset: 0, duration: 3 })!;
      const after = applyToProject(clips, edit.changes);

      expect(clipsOf(after, 'a')).toEqual([
        { id: 'c1', start: 0, offset: 0, duration: 8 },
        { id: 'c2', start: 8, offset: 0, duration: 3 },
        { id: 'c3', start: 12, offset: 12, duration: 4 },
      ]);
      expect(clipsOf(after, 'b')).toEqual([]);
      expect(undoClips(edit)).toEqual(clips);
    });

    it('splits a clip it lands in the middle of', () => {
      const edit = placeClipEdit(clips, 'c2', { trackId: 'a', start: 4, offset: 0, duration: 3 })!;
      const pieces = clipsOf(applyToProject(clips, edit.changes), 'a');

      expect(pieces[0]).toEqual({ id: 'c1', start: 0, offset: 0, duration: 4 });
      expect(pieces[1]).toEqual({ id: 'c2', start: 4, offset: 0, duration: 3 });
      expect(pieces[2]).toMatchObject({ start: 7, offset: 7, duration: 3 });
      expect(undoClips(edit)).toEqual(clips);
    });

    it('trims within the take: never before its start or past its end', () => {
      const head = placeClipEdit(
        clips,
        'c3',
        // The head dragged 14 s left: 2 s further back than the take goes.
        { trackId: 'a', start: -2, offset: -2, duration: 18 },
        'Trim clip',
      )!;
      // It stops at the take's start, with the audio where it was (take time 0 is at 0:00 here).
      expect(head.label).toBe('Trim clip');
      expect(head.changes.at(-1)?.after).toMatchObject({ start: 0, offset: 0, duration: 16 });

      const tail = placeClipEdit(clips, 'c3', {
        trackId: 'a',
        start: 12,
        offset: 12,
        duration: 30,
      })!;
      expect(tail.changes.at(-1)?.after).toMatchObject({ offset: 12, duration: 8 });
    });

    it('keeps at least the minimum length and never starts before 0:00', () => {
      const edit = placeClipEdit(clips, 'c2', { trackId: 'b', start: -1, offset: 0, duration: 0 })!;

      expect(edit.changes.at(-1)?.after).toMatchObject({ start: 0, duration: MIN_CLIP_SECONDS });
    });

    it('does nothing when nothing changes or the clip or track is missing', () => {
      expect(
        placeClipEdit(clips, 'c2', { trackId: 'b', start: 2, offset: 0, duration: 3 }),
      ).toBeNull();
      expect(
        placeClipEdit(clips, 'nope', { trackId: 'b', start: 2, offset: 0, duration: 3 }),
      ).toBeNull();
      expect(
        placeClipEdit(clips, 'c2', { trackId: 'nope', start: 2, offset: 0, duration: 3 }),
      ).toBeNull();
    });
  });

  describe('splitClipEdit', () => {
    it('splits into two clips on the same take, and undo joins them again', () => {
      const { edit, tailId } = splitClipEdit(clips, 'c3', 13)!;

      expect(clipsOf(applyToProject(clips, edit.changes), 'a').slice(1)).toEqual([
        { id: 'c3', start: 12, offset: 12, duration: 1 },
        { id: tailId, start: 13, offset: 13, duration: 3 },
      ]);
      expect(undoClips(edit)).toEqual(clips);
    });

    it('does nothing at (or too close to) the clip edges or outside it', () => {
      expect(splitClipEdit(clips, 'c3', 12)).toBeNull();
      expect(splitClipEdit(clips, 'c3', 16 - MIN_CLIP_SECONDS / 2)).toBeNull();
      expect(splitClipEdit(clips, 'c3', 20)).toBeNull();
    });
  });

  describe('duplicateClipEdit', () => {
    it('places a copy right after the original, replacing what is there', () => {
      // c1 copy at 10…20 covers c3 (12…16) entirely.
      const { edit, copyId } = duplicateClipEdit(clips, 'c1')!;

      expect(clipsOf(applyToProject(clips, edit.changes), 'a')).toEqual([
        { id: 'c1', start: 0, offset: 0, duration: 10 },
        { id: copyId, start: 10, offset: 0, duration: 10 },
      ]);
      expect(undoClips(edit)).toEqual(clips);
    });
  });

  describe('deleteClipEdit', () => {
    it('deletes a clip, and undo restores it', () => {
      const edit = deleteClipEdit(clips, 'c2')!;

      expect(clipsOf(applyToProject(clips, edit.changes), 'b')).toEqual([]);
      expect(undoClips(edit)).toEqual(clips);
      expect(deleteClipEdit(clips, 'nope')).toBeNull();
    });
  });
});
