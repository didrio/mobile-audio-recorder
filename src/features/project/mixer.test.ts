import { hasSolo, trackOutputGain } from './mixer';

const track = { volume: 0.5, muted: false, solo: false };

describe('trackOutputGain', () => {
  it('plays at the track volume unless muted', () => {
    expect(trackOutputGain(track, false)).toBe(0.5);
    expect(trackOutputGain({ ...track, muted: true }, false)).toBe(0);
  });

  it('silences every track that is not soloed while any is', () => {
    expect(hasSolo([track, { ...track, solo: true }])).toBe(true);
    expect(trackOutputGain(track, true)).toBe(0);
    expect(trackOutputGain({ ...track, solo: true }, true)).toBe(0.5);
    expect(trackOutputGain({ ...track, solo: true, muted: true }, true)).toBe(0.5);
  });
});
