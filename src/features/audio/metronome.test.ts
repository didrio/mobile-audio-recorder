import { clickAccent, clicksBetween, clickSamples } from './metronome';

describe('clickAccent', () => {
  it('accents the first beat of each bar in simple meters', () => {
    expect([0, 1, 2, 3, 4].map((beat) => clickAccent(beat, 4, 4))).toEqual([
      'bar',
      'beat',
      'beat',
      'beat',
      'bar',
    ]);
  });

  it('accents each group of three eighths in 6/8 and 12/8, the bar more strongly', () => {
    expect([0, 1, 2, 3, 4, 5].map((beat) => clickAccent(beat, 6, 8))).toEqual([
      'bar',
      'beat',
      'beat',
      'group',
      'beat',
      'beat',
    ]);
    expect([0, 3, 6, 9, 12].map((beat) => clickAccent(beat, 12, 8))).toEqual([
      'bar',
      'group',
      'group',
      'group',
      'bar',
    ]);
  });

  it('does not group 3/4 or 7/8', () => {
    expect(clickAccent(3, 7, 8)).toBe('beat');
    expect(clickAccent(3, 3, 4)).toBe('bar');
  });

  it('continues the bars before 0:00', () => {
    expect([-4, -3, -1].map((beat) => clickAccent(beat, 4, 4))).toEqual(['bar', 'beat', 'beat']);
    expect(clickAccent(-3, 6, 8)).toBe('group');
  });
});

describe('clicksBetween', () => {
  const fourFour = { bpm: 120, beatsPerBar: 4, beatUnit: 4 };

  it('lists the beats in [from, to)', () => {
    expect(clicksBetween(fourFour, 0, 2)).toEqual([
      { position: 0, accent: 'bar' },
      { position: 0.5, accent: 'beat' },
      { position: 1, accent: 'beat' },
      { position: 1.5, accent: 'beat' },
    ]);
  });

  it('includes a beat exactly at the start and excludes one exactly at the end', () => {
    expect(clicksBetween(fourFour, 0.5, 1).map((click) => click.position)).toEqual([0.5]);
    expect(clicksBetween(fourFour, 0.51, 1)).toEqual([]);
  });

  it('counts in before 0:00 on the same grid (two bars of pre-roll)', () => {
    const clicks = clicksBetween(fourFour, -4, 0);
    expect(clicks).toHaveLength(8);
    expect(clicks[0]).toEqual({ position: -4, accent: 'bar' });
    expect(clicks[4]).toEqual({ position: -2, accent: 'bar' });
  });

  it('follows the beat unit: 6/8 at 120 is six eighths in 3 s, accented in threes', () => {
    const clicks = clicksBetween({ bpm: 120, beatsPerBar: 6, beatUnit: 8 }, 0, 3);
    expect(clicks.map((click) => click.accent)).toEqual([
      'bar',
      'beat',
      'beat',
      'group',
      'beat',
      'beat',
    ]);
  });

  it('does not drift or skip beats over long spans split into windows', () => {
    const meter = { bpm: 97, beatsPerBar: 4, beatUnit: 4 };
    const windowed = [];
    for (let at = 0; at < 180; at += 0.07) windowed.push(...clicksBetween(meter, at, at + 0.07));
    const whole = clicksBetween(meter, 0, windowed.length * (60 / 97) - 1e-6);
    expect(windowed.length).toBe(whole.length);
    expect(windowed.at(-1)!.position).toBeCloseTo(whole.at(-1)!.position, 9);
  });

  it('is empty for an empty or reversed range', () => {
    expect(clicksBetween(fourFour, 1, 1)).toEqual([]);
    expect(clicksBetween(fourFour, 2, 1)).toEqual([]);
  });
});

describe('clickSamples', () => {
  it('is a short tick that starts and ends at silence', () => {
    const samples = clickSamples('beat', 48000);
    expect(samples.length).toBe(2400);
    expect(samples[0]).toBe(0);
    expect(Math.abs(samples[samples.length - 1]!)).toBeLessThan(1e-3);
  });

  it('is louder on the downbeat than on other beats, and never clips', () => {
    const peak = (values: Float32Array) => Math.max(...Array.from(values, Math.abs));
    const bar = peak(clickSamples('bar', 44100));
    const group = peak(clickSamples('group', 44100));
    const beat = peak(clickSamples('beat', 44100));
    expect(bar).toBeGreaterThan(group);
    expect(group).toBeGreaterThan(beat);
    expect(bar).toBeLessThanOrEqual(1);
  });
});
