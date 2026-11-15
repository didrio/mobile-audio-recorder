/**
 * Notes for the pitch reference keyboard (T20): MIDI note numbers (60 = middle C = C4, 69 = A4 =
 * 440 Hz, equal temperament), their names, and the key layout and hit testing of a piano keyboard.
 * Key geometry is in white-key units (a white key is 1 wide) and fractions of the key height, so the
 * view scales it to whatever size it has.
 */

export const A4_MIDI = 69;
export const A4_HZ = 440;
/** Lowest and highest notes the keyboard reaches (C1 and C8). */
export const LOWEST_NOTE = 24;
export const HIGHEST_NOTE = 108;

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

/** Black keys are this wide (white-key units) and reach this far down (fraction of the height). */
export const BLACK_KEY_WIDTH = 0.6;
export const BLACK_KEY_HEIGHT = 0.6;

export function noteFrequency(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/** The nearest note to a frequency, and how far off it is in cents (−50…50). For a later tuner. */
export function nearestNote(frequency: number): { midi: number; cents: number } | null {
  if (!(frequency > 0) || !Number.isFinite(frequency)) return null;
  const exact = A4_MIDI + 12 * Math.log2(frequency / A4_HZ);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

/** `C4`, `F♯3`… (sharps; octave numbers change at C). */
export function noteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  return `${NAMES[pitchClass]}${Math.floor(midi / 12) - 1}`;
}

export function isBlackKey(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

/** The C at or below `midi`. */
export function octaveStart(midi: number): number {
  return midi - (((midi % 12) + 12) % 12);
}

export type KeyShape = {
  midi: number;
  black: boolean;
  /** Left edge and width in white-key units from the keyboard's left edge. */
  x: number;
  width: number;
};

/**
 * The keys of a keyboard starting at white key `lowest` with `whiteCount` white keys: white keys
 * first, then the black keys between them (drawn on top). A black key is left out when the white key
 * after it isn't on the keyboard.
 */
export function keyboardKeys(lowest: number, whiteCount: number): KeyShape[] {
  const white: KeyShape[] = [];
  const black: KeyShape[] = [];
  let midi = isBlackKey(lowest) ? lowest + 1 : lowest;
  while (white.length < whiteCount) {
    const index = white.length;
    white.push({ midi, black: false, x: index, width: 1 });
    if (isBlackKey(midi + 1) && index + 1 < whiteCount) {
      black.push({
        midi: midi + 1,
        black: true,
        x: index + 1 - BLACK_KEY_WIDTH / 2,
        width: BLACK_KEY_WIDTH,
      });
      midi += 2;
    } else {
      midi += 1;
    }
  }
  return [...white, ...black];
}

/**
 * The key under a point: `x` in white-key units from the left, `y` as a fraction of the height (0 =
 * top). Black keys win in their upper part. `null` outside the keyboard.
 */
export function keyAt(keys: readonly KeyShape[], x: number, y: number): number | null {
  if (y < 0 || y > 1) return null;
  if (y <= BLACK_KEY_HEIGHT) {
    const black = keys.find((key) => key.black && x >= key.x && x < key.x + key.width);
    if (black) return black.midi;
  }
  const white = keys.find((key) => !key.black && x >= key.x && x < key.x + key.width);
  return white?.midi ?? null;
}
