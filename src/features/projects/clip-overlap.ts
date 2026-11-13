/**
 * One clip per moment per track: placing a clip over others on the same track (recording now, moving
 * clips in T5) replaces what's underneath, like a DAW. The covered parts of the other clips are cut
 * away by changing their window onto the take (`start`, `offset`, `duration`); takes are never touched.
 */

export type ClipWindow = { id: string; start: number; offset: number; duration: number };

export type OverlapEdit =
  /** The clip is entirely covered. */
  | { kind: 'delete'; id: string }
  /** The clip keeps a shorter window (its head or tail was covered). */
  | { kind: 'update'; id: string; start: number; offset: number; duration: number }
  /** The clip spans the whole range: it keeps its head, and a new clip (same take) keeps its tail. */
  | {
      kind: 'split';
      id: string;
      duration: number;
      tail: { start: number; offset: number; duration: number };
    };

/** Shorter than this, a leftover piece of a clip is dropped rather than kept as a sliver. */
const MIN_PIECE_SECONDS = 0.01;

/** The edits that clear `from…to` on a track holding `clips` (other than the one being placed). */
export function clearRange(clips: ClipWindow[], from: number, to: number): OverlapEdit[] {
  const edits: OverlapEdit[] = [];
  for (const clip of clips) {
    const end = clip.start + clip.duration;
    if (end <= from || clip.start >= to) continue;
    const head = from - clip.start;
    const tail = end - to;
    const keepHead = head >= MIN_PIECE_SECONDS;
    const keepTail = tail >= MIN_PIECE_SECONDS;
    if (keepHead && keepTail) {
      edits.push({
        kind: 'split',
        id: clip.id,
        duration: head,
        tail: { start: to, offset: clip.offset + (to - clip.start), duration: tail },
      });
    } else if (keepHead) {
      edits.push({
        kind: 'update',
        id: clip.id,
        start: clip.start,
        offset: clip.offset,
        duration: head,
      });
    } else if (keepTail) {
      edits.push({
        kind: 'update',
        id: clip.id,
        start: to,
        offset: clip.offset + (to - clip.start),
        duration: tail,
      });
    } else {
      edits.push({ kind: 'delete', id: clip.id });
    }
  }
  return edits;
}
