import {
  isBlackKey,
  keyAt,
  keyboardKeys,
  nearestNote,
  noteFrequency,
  noteName,
  octaveStart,
} from './pitch';

describe('noteFrequency', () => {
  it('tunes A4 to 440 Hz in equal temperament', () => {
    expect(noteFrequency(69)).toBe(440);
    expect(noteFrequency(81)).toBe(880);
    expect(noteFrequency(60)).toBeCloseTo(261.626, 3);
    expect(noteFrequency(57)).toBe(220);
  });
});

describe('nearestNote', () => {
  it('finds the note and the cents off it', () => {
    expect(nearestNote(440)).toEqual({ midi: 69, cents: 0 });
    expect(nearestNote(261.626)).toEqual({ midi: 60, cents: 0 });
    expect(nearestNote(445)).toEqual({ midi: 69, cents: 20 });
  });

  it('is null for silence or nonsense', () => {
    expect(nearestNote(0)).toBeNull();
    expect(nearestNote(Number.NaN)).toBeNull();
  });
});

describe('noteName', () => {
  it('names notes with sharps and octave numbers that change at C', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(54)).toBe('F♯3');
    expect(noteName(59)).toBe('B3');
    expect(noteName(69)).toBe('A4');
    expect(noteName(24)).toBe('C1');
  });
});

describe('isBlackKey / octaveStart', () => {
  it('knows the black keys and the C below', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
    ]);
    expect(octaveStart(67)).toBe(60);
    expect(octaveStart(60)).toBe(60);
  });
});

describe('keyboardKeys', () => {
  it('lays out one octave plus the next C: 8 white keys and the 5 black keys between them', () => {
    const keys = keyboardKeys(60, 8);
    expect(keys.filter((key) => !key.black).map((key) => noteName(key.midi))).toEqual([
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
    ]);
    expect(keys.filter((key) => key.black).map((key) => [noteName(key.midi), key.x])).toEqual([
      ['C♯4', 0.7],
      ['D♯4', 1.7],
      ['F♯4', 3.7],
      ['G♯4', 4.7],
      ['A♯4', 5.7],
    ]);
  });

  it('leaves out a black key whose upper white neighbor is off the keyboard', () => {
    // C4…D4: C♯4 fits between them, D♯4 would hang off the right edge.
    expect(keyboardKeys(60, 2).map((key) => key.midi)).toEqual([60, 62, 61]);
  });
});

describe('keyAt', () => {
  const keys = keyboardKeys(60, 8);

  it('hits black keys in their upper part and white keys elsewhere', () => {
    expect(keyAt(keys, 0.9, 0.3)).toBe(61); // C♯4
    expect(keyAt(keys, 0.9, 0.8)).toBe(60); // below the black key: the white key there (C4)
    expect(keyAt(keys, 1.2, 0.8)).toBe(62); // D4
    expect(keyAt(keys, 0.2, 0.3)).toBe(60); // C4, left of C♯
    expect(keyAt(keys, 7.5, 0.5)).toBe(72); // C5
  });

  it('is null outside the keyboard', () => {
    expect(keyAt(keys, 8.1, 0.5)).toBeNull();
    expect(keyAt(keys, 2, 1.2)).toBeNull();
    expect(keyAt(keys, -0.1, 0.5)).toBeNull();
  });
});
