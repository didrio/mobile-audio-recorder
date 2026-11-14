import {
  choosePunch,
  displayPosition,
  fileStartPosition,
  placeTake,
  runUpStart,
  type TakeAlignment,
} from './take-alignment';

const alignment: TakeAlignment = {
  playbackStartedAt: 10,
  recorderStartedAt: 10.08,
  outputLatency: 0.02,
  inputLatency: 0.01,
};

describe('runUpStart', () => {
  it('starts playback the pre-roll before the punch point', () => {
    expect(runUpStart(5, 2)).toBe(3);
  });

  it('keeps the full run-up before 0:00 (played as silence)', () => {
    expect(runUpStart(0.5, 2)).toBe(-1.5);
  });
});

describe('displayPosition', () => {
  it('waits at 0:00 during the silent part of the run-up', () => {
    expect(displayPosition(-1.2)).toBe(0);
    expect(displayPosition(0.4)).toBe(0.4);
  });
});

describe('fileStartPosition', () => {
  it('is where playback started when nothing was playing', () => {
    expect(fileStartPosition(4, null, 0.05)).toBe(4);
  });

  it('adds the recorder start delay and subtracts both latencies', () => {
    expect(fileStartPosition(4, alignment, 0)).toBeCloseTo(4 + 0.08 - 0.02 - 0.01);
  });

  it('moves the take earlier by a positive manual offset', () => {
    expect(fileStartPosition(4, alignment, 0.03)).toBeCloseTo(4.02);
  });

  it('can fall before 0:00 when playback started in the run-up', () => {
    expect(fileStartPosition(-2, alignment, 0)).toBeCloseTo(-2 + 0.05);
  });
});

describe('choosePunch', () => {
  it('keeps the requested punch when the file already reaches it', () => {
    expect(choosePunch(5, 3.1, 3.2, 0.02)).toBe(5);
  });

  it('waits for the recorder when it started after the requested punch', () => {
    expect(choosePunch(5, 5.2, 5.25, 0.02)).toBeCloseTo(5.27);
  });

  it('is never sooner than the lead after the current position', () => {
    expect(choosePunch(5, 5.1, 5.3, 0.02)).toBeCloseTo(5.32);
  });
});

describe('placeTake', () => {
  // Recording without pre-roll: floor 0 reproduces the placement from before punch-in existed.
  it('starts where the file starts when recording from the playhead', () => {
    expect(placeTake({ fileStart: 4.05, floor: 0, takeDuration: 3 })).toEqual({
      start: 4.05,
      offset: 0,
    });
  });

  it('skips the beginning of the take instead of starting before 0', () => {
    const placement = placeTake({ fileStart: -0.13, floor: 0, takeDuration: 3 });
    expect(placement?.start).toBe(0);
    expect(placement?.offset).toBeCloseTo(0.13);
  });

  it('starts a pre-rolled take at the punch point, skipping the run-up', () => {
    const fileStart = fileStartPosition(runUpStart(5, 2), alignment, 0);
    const placement = placeTake({ fileStart, floor: 5, takeDuration: 6 });
    expect(placement?.start).toBe(5);
    expect(placement?.offset).toBeCloseTo(2 - 0.05);
  });

  it('skips exactly the pre-roll when nothing was playing', () => {
    const fileStart = fileStartPosition(runUpStart(0.5, 2), null, 0);
    expect(placeTake({ fileStart, floor: 0.5, takeDuration: 4 })).toEqual({
      start: 0.5,
      offset: 2,
    });
  });

  it('is no take when stopped during the run-up', () => {
    expect(placeTake({ fileStart: 3, floor: 5, takeDuration: 1.5 })).toBeNull();
  });
});
