import { DRAG_MOVE, DRAG_TRIM_END, DRAG_TRIM_START } from './clip-edit-math';
import {
  clampSection,
  dragSection,
  neighborBounds,
  newSectionWindow,
  sectionAt,
  truncateLabel,
} from './section-math';

const sections = [
  { start: 0, duration: 8 },
  { start: 10, duration: 6 },
  { start: 20, duration: 4 },
];

describe('sectionAt / neighborBounds', () => {
  it('finds the section under a time', () => {
    expect(sectionAt(sections, 3)).toBe(0);
    expect(sectionAt(sections, 16)).toBe(1);
    expect(sectionAt(sections, 9)).toBe(-1);
  });

  it('gives the room between the neighbors', () => {
    expect(neighborBounds(sections, 0)).toEqual({ min: 0, max: 10 });
    expect(neighborBounds(sections, 1)).toEqual({ min: 8, max: 20 });
    expect(neighborBounds(sections, 2)).toEqual({ min: 16, max: Infinity });
  });
});

describe('clampSection', () => {
  it('keeps the length while moving it inside, and shortens it only when it cannot fit', () => {
    expect(clampSection({ start: 15, duration: 6 }, { min: 8, max: 20 })).toEqual({
      start: 14,
      duration: 6,
    });
    expect(clampSection({ start: 5, duration: 20 }, { min: 8, max: 20 })).toEqual({
      start: 8,
      duration: 12,
    });
  });
});

describe('dragSection', () => {
  const origin = { start: 10, duration: 6 };
  const bounds = { min: 8, max: 20 };
  const free = { step: 0, minDuration: 1 };

  it('moves and stops at the neighbors', () => {
    expect(dragSection(DRAG_MOVE, origin, 1.5, bounds, free)).toEqual({ start: 11.5, duration: 6 });
    expect(dragSection(DRAG_MOVE, origin, -5, bounds, free)).toEqual({ start: 8, duration: 6 });
    expect(dragSection(DRAG_MOVE, origin, 9, bounds, free)).toEqual({ start: 14, duration: 6 });
  });

  it('resizes either edge, leaving the minimum and staying inside', () => {
    expect(dragSection(DRAG_TRIM_START, origin, -1, bounds, free)).toEqual({
      start: 9,
      duration: 7,
    });
    expect(dragSection(DRAG_TRIM_START, origin, -9, bounds, free)).toEqual({
      start: 8,
      duration: 8,
    });
    expect(dragSection(DRAG_TRIM_START, origin, 9, bounds, free)).toEqual({
      start: 15,
      duration: 1,
    });
    expect(dragSection(DRAG_TRIM_END, origin, 2, bounds, free)).toEqual({ start: 10, duration: 8 });
    expect(dragSection(DRAG_TRIM_END, origin, 9, bounds, free)).toEqual({
      start: 10,
      duration: 10,
    });
    expect(dragSection(DRAG_TRIM_END, origin, -9, bounds, free)).toEqual({
      start: 10,
      duration: 1,
    });
  });

  it('lands moved edges on whole steps (bars)', () => {
    const bars = { step: 2, minDuration: 2 };
    const wide = { min: 0, max: Infinity };
    expect(dragSection(DRAG_MOVE, origin, 1.2, wide, bars)).toEqual({ start: 12, duration: 6 });
    expect(dragSection(DRAG_TRIM_END, origin, 0.7, wide, bars)).toEqual({ start: 10, duration: 6 });
    expect(dragSection(DRAG_TRIM_END, origin, 1.1, wide, bars)).toEqual({ start: 10, duration: 8 });
    expect(dragSection(DRAG_TRIM_START, origin, 5, wide, bars)).toEqual({ start: 14, duration: 2 });
  });
});

describe('newSectionWindow', () => {
  const free = { step: 0, defaultLength: 15, minLength: 1, reach: 0.5 };

  it('starts at the tap and runs the default length, cut short at the next section', () => {
    expect(newSectionWindow(30, sections, free)).toEqual({ start: 30, duration: 15 });
    expect(newSectionWindow(17, sections, free)).toEqual({ start: 17, duration: 3 });
  });

  it('snaps onto the previous end (or 0:00) within reach', () => {
    expect(newSectionWindow(24.3, sections, free)).toEqual({ start: 24, duration: 15 });
    expect(newSectionWindow(0.4, [], free)).toEqual({ start: 0, duration: 15 });
  });

  it('starts at the bar the tap is in with a step, never inside the previous section', () => {
    const bars = { step: 2, defaultLength: 16, minLength: 1, reach: 0 };
    expect(newSectionWindow(31.9, sections, bars)).toEqual({ start: 30, duration: 16 });
    expect(newSectionWindow(16.5, sections, bars)).toEqual({ start: 16, duration: 4 });
    // The bar 6–9 begins inside the first section (it ends at 8): start at its end.
    expect(newSectionWindow(8.5, sections, { ...bars, step: 3 })).toEqual({
      start: 8,
      duration: 2,
    });
  });

  it('is null on a section or where too little fits', () => {
    expect(newSectionWindow(5, sections, free)).toBeNull();
    expect(newSectionWindow(9.5, sections, { ...free, reach: 0 })).toBeNull();
  });
});

describe('truncateLabel', () => {
  const measure = (text: string) => text.length * 10;

  it('keeps names that fit and cuts the rest with an ellipsis', () => {
    expect(truncateLabel('Verse', 50, measure)).toBe('Verse');
    expect(truncateLabel('Pre-chorus', 50, measure)).toBe('Pre-…');
    expect(truncateLabel('Verse 2', 30, measure)).toBe('Ve…');
    expect(truncateLabel('Ab cd', 40, measure)).toBe('Ab…');
    expect(truncateLabel('Verse', 12, measure)).toBe('…');
    expect(truncateLabel('Verse', 5, measure)).toBe('');
  });
});
