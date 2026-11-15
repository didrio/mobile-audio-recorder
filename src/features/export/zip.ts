/**
 * Writes a zip archive (T37: stems, batch export) with `fflate`, stored without compression (audio
 * barely compresses, and storing is fast). Entries are read one at a time and the archive goes out
 * in chunks, so a set of long stems never sits in memory all at once.
 */
import { Zip, ZipPassThrough } from 'fflate';

export type ZipEntry = {
  /** Path inside the archive. */
  name: string;
  /** Reads the entry's bytes (called once, when it's its turn). */
  read: () => Uint8Array;
};

/** Streams a zip of `entries` to `write`, chunk by chunk. Throws if fflate reports an error. */
export function writeZip(entries: readonly ZipEntry[], write: (chunk: Uint8Array) => void): void {
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else if (chunk.length > 0) write(chunk);
  });
  for (const entry of entries) {
    const file = new ZipPassThrough(entry.name);
    zip.add(file);
    file.push(entry.read(), true);
    if (failure) throw failure;
  }
  zip.end();
  if (failure) throw failure;
}
