/**
 * "Tempo & markers" (T37): a tiny Standard MIDI File (format 0, one track, no notes) with the idea's
 * tempo, time signature and its sections as markers. Logic, Ableton, Cubase, Reaper and others
 * import it to set up a session that lines up with the stems.
 *
 * The app's BPM counts beats of `1/beatUnit` notes (`@/features/audio/tempo`); MIDI tempo is per
 * quarter note, so x/8 ideas are converted.
 */
import { isCompound } from '@/features/audio/tempo';

/** Ticks per quarter note. */
export const MIDI_PPQ = 480;

export type MidiMarker = { time: number; name: string };

export type TempoMidiOptions = {
  /** Track name (the idea's name). */
  name: string;
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  /** Markers at times in seconds from the file's start. */
  markers: readonly MidiMarker[];
  /** Length in seconds (where the track ends). */
  length: number;
};

/** Seconds per quarter note at the idea's tempo. */
export function quarterSeconds(bpm: number, beatUnit: number): number {
  return (60 / bpm) * (beatUnit / 4);
}

/** The MIDI tick of a time in seconds. */
export function secondsToTicks(seconds: number, bpm: number, beatUnit: number): number {
  return Math.max(0, Math.round((seconds / quarterSeconds(bpm, beatUnit)) * MIDI_PPQ));
}

export function tempoMidi(options: TempoMidiOptions): Uint8Array<ArrayBuffer> {
  const { bpm, beatsPerBar, beatUnit } = options;
  const microsPerQuarter = Math.round(quarterSeconds(bpm, beatUnit) * 1_000_000);
  const compound = isCompound(beatsPerBar, beatUnit);

  const events: { tick: number; bytes: number[] }[] = [
    { tick: 0, bytes: meta(0x03, utf8(options.name)) },
    {
      tick: 0,
      bytes: meta(0x51, [
        (microsPerQuarter >> 16) & 0xff,
        (microsPerQuarter >> 8) & 0xff,
        microsPerQuarter & 0xff,
      ]),
    },
    {
      tick: 0,
      // Numerator, denominator as a power of two, MIDI clocks per metronome click (a dotted
      // quarter in compound meters), 32nd notes per quarter.
      bytes: meta(0x58, [beatsPerBar, Math.round(Math.log2(beatUnit)), compound ? 36 : 24, 8]),
    },
    ...[...options.markers]
      .sort((a, b) => a.time - b.time)
      .map((marker) => ({
        tick: secondsToTicks(marker.time, bpm, beatUnit),
        bytes: meta(0x06, utf8(marker.name)),
      })),
  ];
  const endTick = Math.max(
    secondsToTicks(options.length, bpm, beatUnit),
    ...events.map((event) => event.tick),
  );
  events.push({ tick: endTick, bytes: meta(0x2f, []) });

  const track: number[] = [];
  let previous = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previous), ...event.bytes);
    previous = event.tick;
  }

  return Uint8Array.from([
    ...ascii('MThd'),
    ...uint32(6),
    ...uint16(0), // format 0
    ...uint16(1), // one track
    ...uint16(MIDI_PPQ),
    ...ascii('MTrk'),
    ...uint32(track.length),
    ...track,
  ]);
}

function meta(type: number, data: number[]): number[] {
  return [0xff, type, ...variableLength(data.length), ...data];
}

/** MIDI's variable-length quantity: 7 bits per byte, high bit set on all but the last. */
export function variableLength(value: number): number[] {
  let rest = Math.max(0, Math.floor(value));
  const bytes = [rest & 0x7f];
  rest = Math.floor(rest / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}
