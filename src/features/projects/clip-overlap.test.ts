import { clearRange } from './clip-overlap';

const clip = (id: string, start: number, duration: number, offset = 0) => ({
  id,
  start,
  offset,
  duration,
});

describe('clearRange', () => {
  it('leaves clips outside the range alone (touching edges included)', () => {
    expect(clearRange([clip('a', 0, 2), clip('b', 5, 1)], 2, 5)).toEqual([]);
  });

  it('deletes a clip that is entirely covered', () => {
    expect(clearRange([clip('a', 3, 1)], 2, 5)).toEqual([{ kind: 'delete', id: 'a' }]);
  });

  it('trims the tail of a clip that starts before the range', () => {
    expect(clearRange([clip('a', 0, 4, 1)], 2, 5)).toEqual([
      { kind: 'update', id: 'a', start: 0, offset: 1, duration: 2 },
    ]);
  });

  it('trims the head of a clip that ends after the range, keeping the audio in place', () => {
    expect(clearRange([clip('a', 4, 4, 0.5)], 2, 5)).toEqual([
      { kind: 'update', id: 'a', start: 5, offset: 1.5, duration: 3 },
    ]);
  });

  it('splits a clip that spans the whole range', () => {
    expect(clearRange([clip('a', 0, 9, 0.2)], 2, 5)).toEqual([
      {
        kind: 'split',
        id: 'a',
        duration: 2,
        tail: { start: 5, offset: 5.2, duration: 4 },
      },
    ]);
  });

  it('drops slivers instead of keeping tiny pieces', () => {
    expect(clearRange([clip('a', 1.995, 3.01)], 2, 5)).toEqual([{ kind: 'delete', id: 'a' }]);
  });
});
