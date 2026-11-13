import {
  dbToGain,
  dragPosition,
  FADER_DRAG_RANGE,
  formatDb,
  gainToPosition,
  MAX_DB,
  MIN_DB,
  positionToGain,
  stepGain,
} from './fader-math';

describe('fader math', () => {
  it('maps positions to decibels, with silence at the bottom', () => {
    expect(positionToGain(0)).toBe(0);
    expect(positionToGain(1)).toBeCloseTo(dbToGain(MAX_DB));
    expect(positionToGain(gainToPosition(0.5))).toBeCloseTo(0.5);
    expect(gainToPosition(0)).toBe(0);
    expect(gainToPosition(1)).toBeCloseTo(-MIN_DB / (MAX_DB - MIN_DB));
  });

  it('snaps to exactly 0 dB near unity', () => {
    expect(positionToGain(gainToPosition(dbToGain(0.3)))).toBe(1);
    expect(positionToGain(gainToPosition(dbToGain(-0.6)))).toBeCloseTo(dbToGain(-0.6));
  });

  it('moves relative to where the drag started, over a long finger range', () => {
    expect(dragPosition(0.5, FADER_DRAG_RANGE / 4)).toBeCloseTo(0.75);
    expect(dragPosition(0.5, -FADER_DRAG_RANGE)).toBe(0);
    expect(dragPosition(0.9, FADER_DRAG_RANGE)).toBe(1);
  });

  it('steps by whole decibels within the range', () => {
    expect(stepGain(1, 1)).toBeCloseTo(dbToGain(1));
    expect(stepGain(1, -3)).toBeCloseTo(dbToGain(-3));
    expect(stepGain(dbToGain(MAX_DB), 1)).toBeCloseTo(dbToGain(MAX_DB));
    expect(stepGain(dbToGain(MIN_DB), -1)).toBe(0);
    expect(stepGain(0, 1)).toBeCloseTo(dbToGain(MIN_DB));
    expect(stepGain(0, -1)).toBe(0);
  });

  it('formats decibels with a sign', () => {
    expect(formatDb(1)).toBe('0.0 dB');
    expect(formatDb(0.5)).toBe('−6.0 dB');
    expect(formatDb(dbToGain(2.5))).toBe('+2.5 dB');
    expect(formatDb(0)).toBe('−∞ dB');
    expect(formatDb(dbToGain(-0.04))).toBe('0.0 dB');
  });
});
