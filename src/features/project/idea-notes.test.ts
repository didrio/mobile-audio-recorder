import { formatTimeStamp, hasNotes, insertTimeStamp, splitTimeStamps } from './idea-notes';

describe('formatTimeStamp', () => {
  it('rounds down to the second', () => {
    expect(formatTimeStamp(0)).toBe('[0:00]');
    expect(formatTimeStamp(83.9)).toBe('[1:23]');
    expect(formatTimeStamp(600)).toBe('[10:00]');
  });

  it('shows negative and non-finite times as zero', () => {
    expect(formatTimeStamp(-2)).toBe('[0:00]');
    expect(formatTimeStamp(Number.NaN)).toBe('[0:00]');
  });
});

describe('splitTimeStamps', () => {
  it('finds stamps anywhere in the text, keeping everything else as plain runs', () => {
    const text = '[0:45] chorus: Fmaj7 – Em7\nbridge at [1:23] (capo 2)';
    const segments = splitTimeStamps(text);
    expect(segments).toEqual([
      { text: '[0:45]', time: 45 },
      { text: ' chorus: Fmaj7 – Em7\nbridge at ', time: null },
      { text: '[1:23]', time: 83 },
      { text: ' (capo 2)', time: null },
    ]);
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
  });

  it('accepts a tenth of a second, as the clock shows it', () => {
    expect(splitTimeStamps('[0:07.3]')).toEqual([{ text: '[0:07.3]', time: 7.3 }]);
  });

  it('ignores brackets that are not times', () => {
    const text = '[Verse] [1:5] [1:75] [chords] 1:23';
    expect(splitTimeStamps(text)).toEqual([{ text, time: null }]);
  });

  it('returns nothing for empty text', () => {
    expect(splitTimeStamps('')).toEqual([]);
  });
});

describe('hasNotes', () => {
  it('is false for blank text', () => {
    expect(hasNotes('')).toBe(false);
    expect(hasNotes(' \n ')).toBe(false);
    expect(hasNotes('capo 2')).toBe(true);
  });
});

describe('insertTimeStamp', () => {
  it('inserts into empty text with a space after, cursor after the space', () => {
    expect(insertTimeStamp('', { start: 0, end: 0 }, 45)).toEqual({ text: '[0:45] ', cursor: 7 });
  });

  it('adds a space before when it would touch the previous word', () => {
    expect(insertTimeStamp('chorus', { start: 6, end: 6 }, 83)).toEqual({
      text: 'chorus [1:23] ',
      cursor: 14,
    });
  });

  it('adds no space before at the start of a line', () => {
    expect(insertTimeStamp('intro\n', { start: 6, end: 6 }, 3)).toEqual({
      text: 'intro\n[0:03] ',
      cursor: 13,
    });
  });

  it('reuses the space that follows, putting the cursor after it', () => {
    expect(insertTimeStamp('a  b', { start: 1, end: 1 }, 10)).toEqual({
      text: 'a [0:10]  b',
      cursor: 9,
    });
  });

  it('adds a space when a word or line break follows', () => {
    expect(insertTimeStamp('ab', { start: 1, end: 1 }, 10)).toEqual({
      text: 'a [0:10] b',
      cursor: 9,
    });
    expect(insertTimeStamp('a\nb', { start: 2, end: 2 }, 10).text).toBe('a\n[0:10] b');
  });

  it('replaces a selected range, whichever way it was selected', () => {
    expect(insertTimeStamp('at XX here', { start: 5, end: 3 }, 61)).toEqual({
      text: 'at [1:01] here',
      cursor: 10,
    });
  });

  it('clamps a cursor outside the text to its end', () => {
    expect(insertTimeStamp('end', { start: 99, end: 99 }, 0)).toEqual({
      text: 'end [0:00] ',
      cursor: 11,
    });
  });
});
