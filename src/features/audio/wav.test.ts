import { encodeWav } from './wav';

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

describe('encodeWav', () => {
  it('writes a 24-bit mono PCM header', () => {
    const bytes = encodeWav([new Float32Array(10)], 48000, 24);
    const view = new DataView(bytes.buffer);
    expect(bytes.length).toBe(44 + 30);
    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 30);
    expect(ascii(bytes, 8, 8)).toBe('WAVEfmt ');
    expect(view.getUint16(20, true)).toBe(1); // integer PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 3);
    expect(view.getUint16(32, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(24);
    expect(ascii(bytes, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(30);
  });

  it('stores samples little-endian, clipping anything beyond full scale', () => {
    const bytes = encodeWav([Float32Array.from([0, 1, -1, 0.5, 2, -3])], 44100, 24);
    const sample = (index: number) => {
      const at = 44 + index * 3;
      const value = bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
      return value & 0x800000 ? value - 0x1000000 : value;
    };
    expect([0, 1, 2, 3, 4, 5].map(sample)).toEqual([
      0, 8388607, -8388607, 4194304, 8388607, -8388607,
    ]);
  });

  it('interleaves channels and supports 16-bit', () => {
    const bytes = encodeWav([Float32Array.from([1, 0]), Float32Array.from([-1, 0.5])], 8000, 16);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(32, true)).toBe(4);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      32767, -32767, 0, 16384,
    ]);
  });
});
