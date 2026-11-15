import { quarterSeconds, secondsToTicks, tempoMidi, variableLength } from './tempo-midi';

describe('variableLength', () => {
  it('encodes MIDI variable-length quantities', () => {
    expect(variableLength(0)).toEqual([0x00]);
    expect(variableLength(0x7f)).toEqual([0x7f]);
    expect(variableLength(0x80)).toEqual([0x81, 0x00]);
    expect(variableLength(1920)).toEqual([0x8f, 0x00]);
    expect(variableLength(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });
});

describe('tempoMidi', () => {
  it('writes a format 0 file with tempo, time signature and markers', () => {
    const bytes = tempoMidi({
      name: 'Hi',
      bpm: 120,
      beatsPerBar: 4,
      beatUnit: 4,
      markers: [{ time: 2, name: 'Verse' }],
      length: 4,
    });
    expect([...bytes]).toEqual([
      // MThd: length 6, format 0, 1 track, 480 ticks per quarter
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0],
      // MTrk and its length
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 36],
      // Track name "Hi"
      ...[0x00, 0xff, 0x03, 2, 0x48, 0x69],
      // Tempo: 500000 µs per quarter (120 BPM)
      ...[0x00, 0xff, 0x51, 3, 0x07, 0xa1, 0x20],
      // 4/4, 24 clocks per click, 8 32nds per quarter
      ...[0x00, 0xff, 0x58, 4, 4, 2, 24, 8],
      // Marker "Verse" at 2 s = 4 quarters = 1920 ticks
      ...[0x8f, 0x00, 0xff, 0x06, 5, 0x56, 0x65, 0x72, 0x73, 0x65],
      // End of track at 4 s (another 1920 ticks)
      ...[0x8f, 0x00, 0xff, 0x2f, 0],
    ]);
  });

  it('converts eighth-note beats to quarter-note tempo for x/8 meters', () => {
    // 6/8 at 120 eighths per minute = 60 quarters per minute.
    expect(quarterSeconds(120, 8)).toBe(1);
    expect(secondsToTicks(1, 120, 8)).toBe(480);
    const bytes = tempoMidi({
      name: '',
      bpm: 120,
      beatsPerBar: 6,
      beatUnit: 8,
      markers: [],
      length: 0,
    });
    const tempoAt = bytes.findIndex((byte, index) => byte === 0xff && bytes[index + 1] === 0x51);
    expect([...bytes.subarray(tempoAt + 3, tempoAt + 6)]).toEqual([0x0f, 0x42, 0x40]); // 1 000 000 µs
    const signatureAt = bytes.findIndex(
      (byte, index) => byte === 0xff && bytes[index + 1] === 0x58,
    );
    expect([...bytes.subarray(signatureAt + 3, signatureAt + 7)]).toEqual([6, 3, 36, 8]);
  });
});
