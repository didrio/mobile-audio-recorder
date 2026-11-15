/**
 * Time stamps in idea notes (T24): `[1:23]` marks a moment of the idea ("[0:45] chorus: Fmaj7 – Em7").
 * "Insert time" writes the playhead time at the cursor; outside editing each stamp is a link that
 * seeks there. Minutes can have any number of digits, seconds two; a tenth (`[1:23.5]`) is accepted
 * too, so stamps typed by hand from the clock still work.
 */

const TIME_STAMP = /\[(\d{1,3}):([0-5]\d)(?:\.(\d))?\]/g;

/** A run of note text: plain, or a time stamp with the time it points at (seconds). */
export type NoteSegment = { text: string; time: number | null };

/** `[m:ss]`, rounded down to the second, so a stamp lands at or just before the moment it marks. */
export function formatTimeStamp(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `[${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}]`;
}

/** Splits `text` into plain runs and time stamps, in order. Joining the runs gives `text` back. */
export function splitTimeStamps(text: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TIME_STAMP)) {
    const index = match.index;
    if (index > last) segments.push({ text: text.slice(last, index), time: null });
    const [stamp, minutes = '0', seconds = '0', tenths] = match;
    segments.push({
      text: stamp,
      time: Number(minutes) * 60 + Number(seconds) + (tenths ? Number(tenths) / 10 : 0),
    });
    last = index + stamp.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), time: null });
  return segments;
}

/** Whether `text` has anything worth showing (the dot on the Notes button). */
export function hasNotes(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Inserts the stamp for `seconds` at the cursor (replacing a selected range), with a space before it
 * when it would touch the previous word and one after it, so typing can go straight on. Returns the
 * new text and where the cursor goes (right after the inserted stamp and space).
 */
export function insertTimeStamp(
  text: string,
  selection: { start: number; end: number },
  seconds: number,
): { text: string; cursor: number } {
  const start = clamp(Math.min(selection.start, selection.end), 0, text.length);
  const end = clamp(Math.max(selection.start, selection.end), start, text.length);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trail = /^[ \t]/.test(after) ? '' : ' ';
  const inserted = `${lead}${formatTimeStamp(seconds)}${trail}`;
  // With no space added, the one already there is stepped over.
  return {
    text: before + inserted + after,
    cursor: before.length + inserted.length + (trail ? 0 : 1),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
