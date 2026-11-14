import {
  DRAG_MOVE,
  DRAG_NONE,
  DRAG_TRIM_END,
  DRAG_TRIM_START,
  dragWindow,
  grabPart,
  itemAt,
  nearestSnap,
  rowAt,
  snapDrag,
} from './clip-edit-math';

describe('itemAt', () => {
  const items = [
    { start: 0, duration: 4, row: 0 },
    { start: 6, duration: 2, row: 0 },
    { start: 1, duration: 10, row: 1 },
  ];

  it('finds the item on the row under the time', () => {
    expect(itemAt(items, 7, 0)).toBe(1);
    expect(itemAt(items, 2, 1)).toBe(2);
  });

  it('misses gaps and other rows', () => {
    expect(itemAt(items, 5, 0)).toBe(-1);
    expect(itemAt(items, 0.5, 1)).toBe(-1);
    expect(itemAt(items, 2, 2)).toBe(-1);
  });
});

describe('grabPart', () => {
  const item = { start: 10, duration: 8 };

  it('grabs an edge within reach, inside or outside the item', () => {
    expect(grabPart(item, 9.6, 0.5)).toBe(DRAG_TRIM_START);
    expect(grabPart(item, 10.3, 0.5)).toBe(DRAG_TRIM_START);
    expect(grabPart(item, 17.8, 0.5)).toBe(DRAG_TRIM_END);
    expect(grabPart(item, 18.4, 0.5)).toBe(DRAG_TRIM_END);
  });

  it('grabs the body in between, and nothing out of reach', () => {
    expect(grabPart(item, 14, 0.5)).toBe(DRAG_MOVE);
    expect(grabPart(item, 9, 0.5)).toBe(DRAG_NONE);
    expect(grabPart(item, 19, 0.5)).toBe(DRAG_NONE);
  });

  it('keeps the middle half of a narrow item for moving', () => {
    const narrow = { start: 10, duration: 0.4 };
    expect(grabPart(narrow, 10.2, 0.5)).toBe(DRAG_MOVE);
    expect(grabPart(narrow, 10.05, 0.5)).toBe(DRAG_TRIM_START);
    expect(grabPart(narrow, 10.35, 0.5)).toBe(DRAG_TRIM_END);
  });
});

describe('dragWindow', () => {
  // Shows 4…12 s of a 20 s source, placed at 10 s.
  const origin = { start: 10, offset: 4, duration: 8 };

  it('moves the window, stopping at 0:00', () => {
    expect(dragWindow(DRAG_MOVE, origin, 3, 20, 0.05)).toEqual({ ...origin, start: 13 });
    expect(dragWindow(DRAG_MOVE, origin, -15, 20, 0.05)).toEqual({ ...origin, start: 0 });
  });

  it('trims the start: the audio stays put, and it extends back to the source start', () => {
    expect(dragWindow(DRAG_TRIM_START, origin, 2, 20, 0.05)).toEqual({
      start: 12,
      offset: 6,
      duration: 6,
    });
    expect(dragWindow(DRAG_TRIM_START, origin, -9, 20, 0.05)).toEqual({
      start: 6,
      offset: 0,
      duration: 12,
    });
  });

  it('trims the start no earlier than 0:00', () => {
    const early = { start: 1, offset: 4, duration: 8 };
    expect(dragWindow(DRAG_TRIM_START, early, -3, 20, 0.05)).toEqual({
      start: 0,
      offset: 3,
      duration: 9,
    });
  });

  it('trims the end, out to the source end at most', () => {
    expect(dragWindow(DRAG_TRIM_END, origin, -5, 20, 0.05)).toEqual({ ...origin, duration: 3 });
    expect(dragWindow(DRAG_TRIM_END, origin, 30, 20, 0.05)).toEqual({ ...origin, duration: 16 });
  });

  it('never trims below the minimum length', () => {
    expect(dragWindow(DRAG_TRIM_START, origin, 20, 20, 0.05).duration).toBeCloseTo(0.05);
    expect(dragWindow(DRAG_TRIM_END, origin, -20, 20, 0.05).duration).toBeCloseTo(0.05);
  });
});

describe('nearestSnap', () => {
  it('returns the closest candidate within the threshold', () => {
    expect(nearestSnap(5.1, [0, 5, 5.3], 0.25)).toBe(5);
    expect(nearestSnap(5.2, [0, 5, 5.3], 0.25)).toBe(5.3);
    expect(nearestSnap(6, [0, 5, 5.3], 0.25)).toBeNull();
  });
});

describe('snapDrag', () => {
  const origin = { start: 10, duration: 4 };

  it('snaps a move by whichever edge is closer', () => {
    // Raw: 12…16. 12.1 is 0.1 from the start; 16.2 is 0.2 from the end.
    const byStart = snapDrag(DRAG_MOVE, origin, 2, [12.1, 16.2], 0.3);
    expect(byStart.delta).toBeCloseTo(2.1);
    expect(byStart.snapTime).toBe(12.1);
    // Raw: 12…16. Only the end is in reach.
    const byEnd = snapDrag(DRAG_MOVE, origin, 2, [15.8], 0.3);
    expect(byEnd.delta).toBeCloseTo(1.8);
    expect(byEnd.snapTime).toBe(15.8);
  });

  it('snaps only the edge a trim moves', () => {
    // Trimming the start to 11: the candidate near the (unmoved) end is ignored.
    expect(snapDrag(DRAG_TRIM_START, origin, 1, [14.1], 0.3)).toEqual({ delta: 1, snapTime: -1 });
    const end = snapDrag(DRAG_TRIM_END, origin, 1, [15.2], 0.3);
    expect(end.delta).toBeCloseTo(1.2);
    expect(end.snapTime).toBe(15.2);
  });

  it('leaves the drag alone when nothing is in reach', () => {
    expect(snapDrag(DRAG_MOVE, origin, 2, [0, 30], 0.3)).toEqual({ delta: 2, snapTime: -1 });
  });
});

describe('rowAt', () => {
  it('maps a y (with scroll) to a row, clamped to the rows that exist', () => {
    expect(rowAt(10, 0, 88, 3)).toBe(0);
    expect(rowAt(100, 0, 88, 3)).toBe(1);
    expect(rowAt(10, 176, 88, 3)).toBe(2);
    expect(rowAt(-20, 0, 88, 3)).toBe(0);
    expect(rowAt(1000, 0, 88, 3)).toBe(2);
  });
});
