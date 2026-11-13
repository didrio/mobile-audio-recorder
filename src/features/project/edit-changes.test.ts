import { applyToProject, invertEdit, trackRow, type Edit } from './edit-changes';
import { testClip, testProject, testTrack } from './edit-test-data';

const project = testProject([
  testTrack('a', 0, [testClip('c1', 'a', 0, 4), testClip('c2', 'a', 6, 2)]),
  testTrack('b', 1, [testClip('c3', 'b', 1, 3)]),
]);

/** Applying an edit and then its inverse gives back the original project. */
function roundTrip(edit: Edit) {
  const after = applyToProject(project, edit.changes);
  return { after, restored: applyToProject(after, invertEdit(edit).changes) };
}

describe('applyToProject', () => {
  it('inserts a track and a clip, keeping tracks by position and clips by start', () => {
    const edit: Edit = {
      label: 'test',
      changes: [
        { table: 'tracks', id: 'z', before: null, after: trackRow(testTrack('z', 2)) },
        { table: 'clips', id: 'c4', before: null, after: testClip('c4', 'a', 4.5, 1) },
      ],
    };
    const { after, restored } = roundTrip(edit);

    expect(after.tracks.map((t) => t.id)).toEqual(['a', 'b', 'z']);
    expect(after.tracks[0]?.clips.map((c) => c.id)).toEqual(['c1', 'c4', 'c2']);
    expect(restored).toEqual(project);
  });

  it('updates a clip, moves it to another track and recomputes the duration', () => {
    const c2 = testClip('c2', 'a', 6, 2);
    const edit: Edit = {
      label: 'test',
      changes: [
        { table: 'clips', id: 'c2', before: c2, after: { ...c2, trackId: 'b', start: 10 } },
      ],
    };
    const { after, restored } = roundTrip(edit);

    expect(after.tracks[0]?.clips.map((c) => c.id)).toEqual(['c1']);
    expect(after.tracks[1]?.clips.map((c) => c.id)).toEqual(['c3', 'c2']);
    expect(after.duration).toBe(12);
    expect(restored).toEqual(project);
  });

  it('deletes a track with its clips, and the inverse restores both', () => {
    const b = project.tracks[1]!;
    const edit: Edit = {
      label: 'test',
      changes: [
        { table: 'clips', id: 'c3', before: b.clips[0]!, after: null },
        { table: 'tracks', id: 'b', before: trackRow(b), after: null },
      ],
    };
    const { after, restored } = roundTrip(edit);

    expect(after.tracks.map((t) => t.id)).toEqual(['a']);
    expect(restored).toEqual(project);
  });

  it('drops clips whose track is gone, as the database cascade does', () => {
    const after = applyToProject(project, [
      { table: 'tracks', id: 'b', before: trackRow(project.tracks[1]!), after: null },
    ]);
    expect(after.tracks.flatMap((t) => t.clips.map((c) => c.id))).toEqual(['c1', 'c2']);
  });

  it('inverts changes in reverse order', () => {
    const edit: Edit = {
      label: 'test',
      changes: [
        { table: 'tracks', id: 'z', before: null, after: trackRow(testTrack('z', 2)) },
        { table: 'clips', id: 'c4', before: null, after: testClip('c4', 'z', 0, 1) },
      ],
    };
    expect(invertEdit(edit).changes.map((c) => [c.id, c.after])).toEqual([
      ['c4', null],
      ['z', null],
    ]);
  });
});
