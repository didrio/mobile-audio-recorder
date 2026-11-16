import { playedFraction, scrubFraction } from './scrub-math';

describe('scrubFraction', () => {
  it('maps a touch to 0..1 and clamps outside the bar', () => {
    expect(scrubFraction(50, 200)).toBe(0.25);
    expect(scrubFraction(-10, 200)).toBe(0);
    expect(scrubFraction(300, 200)).toBe(1);
  });

  it('is 0 before the bar is measured', () => {
    expect(scrubFraction(50, 0)).toBe(0);
    expect(scrubFraction(NaN, 200)).toBe(0);
  });
});

describe('playedFraction', () => {
  it('is the position over the length, clamped', () => {
    expect(playedFraction(30, 120)).toBe(0.25);
    expect(playedFraction(200, 120)).toBe(1);
    expect(playedFraction(-1, 120)).toBe(0);
  });

  it('is 0 without a position or a length', () => {
    expect(playedFraction(null, 120)).toBe(0);
    expect(playedFraction(5, 0)).toBe(0);
  });
});
