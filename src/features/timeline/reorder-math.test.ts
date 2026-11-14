import {
  autoScrollSpeed,
  dropIndex,
  laneShift,
  laneTopDuringDrag,
  moveIndex,
} from './reorder-math';

const LANE = 88;

describe('moveIndex', () => {
  it('moves an item down or up', () => {
    expect(moveIndex(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveIndex(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('clamps the target and leaves the input alone', () => {
    const items = ['a', 'b', 'c'];
    expect(moveIndex(items, 0, 10)).toEqual(['b', 'c', 'a']);
    expect(moveIndex(items, 2, -3)).toEqual(['c', 'a', 'b']);
    expect(moveIndex(items, 5, 0)).toEqual(items);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('dropIndex', () => {
  it('is the slot under the lane center', () => {
    expect(dropIndex(0, LANE, 4)).toBe(0);
    expect(dropIndex(LANE / 2 - 1, LANE, 4)).toBe(0);
    expect(dropIndex(LANE / 2, LANE, 4)).toBe(1);
    expect(dropIndex(2 * LANE + 10, LANE, 4)).toBe(2);
  });

  it('stays within the tracks', () => {
    expect(dropIndex(-200, LANE, 4)).toBe(0);
    expect(dropIndex(10 * LANE, LANE, 4)).toBe(3);
    expect(dropIndex(100, LANE, 0)).toBe(0);
  });
});

describe('laneShift', () => {
  it('shifts nothing while hovering over the start slot', () => {
    for (let index = 0; index < 4; index++) expect(laneShift(index, 1, 1, LANE)).toBe(0);
  });

  it('dragging down moves the lanes in between up by one lane', () => {
    // Lane 0 lifted, hovering over slot 2.
    expect([0, 1, 2, 3].map((index) => laneShift(index, 0, 2, LANE))).toEqual([0, -LANE, -LANE, 0]);
  });

  it('dragging up moves the lanes in between down by one lane', () => {
    // Lane 3 lifted, hovering over slot 1.
    expect([0, 1, 2, 3].map((index) => laneShift(index, 3, 1, LANE))).toEqual([0, LANE, LANE, 0]);
  });

  it('glides between slots', () => {
    expect(laneShift(1, 0, 0.5, LANE)).toBe(-LANE / 2);
    expect(laneShift(2, 3, 2.25, LANE)).toBe(LANE * 0.75);
  });

  it('does nothing without a drag', () => {
    expect(laneShift(2, -1, 0, LANE)).toBe(0);
  });
});

describe('laneTopDuringDrag', () => {
  it('puts the lifted lane at the drag position and the others in their (shifted) slots', () => {
    expect(laneTopDuringDrag(0, LANE, 0, 150, 2)).toBe(150);
    expect(laneTopDuringDrag(1, LANE, 0, 150, 2)).toBe(0);
    expect(laneTopDuringDrag(3, LANE, 0, 150, 2)).toBe(3 * LANE);
    expect(laneTopDuringDrag(2, LANE, -1, 0, 0)).toBe(2 * LANE);
  });

  it('settles into the plain layout once the new order has been applied', () => {
    // After dropping lane 0 on slot 2 the order is re-rendered: the lifted track is now index 2,
    // the drop slot is 2 and it sits at 2 * LANE, so every lane is in its normal place.
    for (let index = 0; index < 4; index++) {
      expect(laneTopDuringDrag(index, LANE, 2, 2 * LANE, 2)).toBe(index * LANE);
    }
  });
});

describe('autoScrollSpeed', () => {
  it('scrolls up near the top and down near the bottom, faster closer to the edge', () => {
    expect(autoScrollSpeed(0, 400, 50, 600)).toBe(-600);
    expect(autoScrollSpeed(25, 400, 50, 600)).toBe(-300);
    expect(autoScrollSpeed(375, 400, 50, 600)).toBe(300);
    expect(autoScrollSpeed(450, 400, 50, 600)).toBe(600);
    expect(autoScrollSpeed(-30, 400, 50, 600)).toBe(-600);
  });

  it('is still in the middle', () => {
    expect(autoScrollSpeed(50, 400, 50, 600)).toBe(0);
    expect(autoScrollSpeed(200, 400, 50, 600)).toBe(0);
  });

  it('keeps the bands apart in a short viewport', () => {
    expect(autoScrollSpeed(30, 60, 50, 600)).toBe(0);
    expect(autoScrollSpeed(0, 0, 50, 600)).toBe(0);
  });
});
