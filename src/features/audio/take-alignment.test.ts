import { placeTake, type TakeAlignment } from './take-alignment';

const alignment: TakeAlignment = {
  playbackStartedAt: 10,
  recorderStartedAt: 10.08,
  outputLatency: 0.02,
  inputLatency: 0.01,
};

describe('placeTake', () => {
  it('starts at the playhead when nothing was playing', () => {
    expect(placeTake(4, null, 0.05)).toEqual({ start: 4, offset: 0 });
  });

  it('adds the recorder start delay and subtracts both latencies', () => {
    const placement = placeTake(4, alignment, 0);
    expect(placement.start).toBeCloseTo(4 + 0.08 - 0.02 - 0.01);
    expect(placement.offset).toBe(0);
  });

  it('moves the take earlier by a positive manual offset', () => {
    expect(placeTake(4, alignment, 0.03).start).toBeCloseTo(4.02);
  });

  it('skips the beginning of the take instead of starting before 0', () => {
    const placement = placeTake(0, { ...alignment, recorderStartedAt: 10 }, 0.1);
    expect(placement.start).toBe(0);
    expect(placement.offset).toBeCloseTo(0.13);
  });
});
