import { unzipSync } from 'fflate';

import { writeZip } from './zip';

describe('writeZip', () => {
  it('streams a zip whose entries come back byte for byte, names included', () => {
    const chunks: Uint8Array[] = [];
    const read = jest.fn((bytes: number[]) => Uint8Array.from(bytes));
    writeZip(
      [
        { name: '01 Vocals.wav', read: () => read([1, 2, 3]) },
        { name: 'Song – stems info.txt', read: () => new TextEncoder().encode('Tempo: 120') },
        { name: 'empty.mid', read: () => new Uint8Array(0) },
      ],
      (chunk) => chunks.push(chunk.slice()),
    );
    expect(chunks.length).toBeGreaterThan(1);

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const zip = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      zip.set(chunk, at);
      at += chunk.length;
    }
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(['01 Vocals.wav', 'Song – stems info.txt', 'empty.mid']);
    expect([...files['01 Vocals.wav']!]).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(files['Song – stems info.txt'])).toBe('Tempo: 120');
    expect(files['empty.mid']!.length).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
