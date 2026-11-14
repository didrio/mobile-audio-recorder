/**
 * Where take audio files live on disk.
 *
 * Layout: `<documents>/projects/<projectId>/takes/<takeId>.wav`, plus `<takeId>.peaks` (waveform
 * overview, see `@/features/timeline/waveform-peaks`) and, for takes cleaned in Speaker mode,
 * `<takeId>.raw.wav` (the recording as the mic heard it, kept for re-cleaning or going back). The database stores the path
 * relative to the document directory (see `@/lib/db`), because the absolute path changes between
 * installs and app updates on iOS.
 */
import { Directory, File, Paths } from 'expo-file-system';

export function takeRelativePath(projectId: string, takeId: string): string {
  return `projects/${projectId}/takes/${takeId}.wav`;
}

/** Absolute `file://` URI for a path stored in the database. */
export function takeUri(relativePath: string): string {
  return new File(Paths.document, relativePath).uri;
}

/** The waveform peaks file that belongs to a take (may not exist yet). */
export function peaksFile(takeRelativePath: string): File {
  return new File(Paths.document, takeRelativePath.replace(/\.wav$/, '') + '.peaks');
}

/** The uncleaned recording kept next to a Speaker-mode take (may not exist). */
export function rawTakeFile(takeRelativePath: string): File {
  return new File(Paths.document, takeRelativePath.replace(/\.wav$/, '') + '.raw.wav');
}

/** Plain filesystem path (no `file://`), as native audio APIs expect. */
export function takeFilePath(relativePath: string): string {
  return decodeURI(takeUri(relativePath).replace(/^file:\/\//, ''));
}

/** A plain filesystem path from a plain path or a `file://` URI. */
export function plainPath(pathOrUri: string): string {
  return pathOrUri.startsWith('file://')
    ? decodeURI(pathOrUri.replace(/^file:\/\//, ''))
    : pathOrUri;
}

function fileAt(plainOrUri: string): File {
  return new File(
    plainOrUri.startsWith('file://') ? plainOrUri : `file://${encodeURI(plainOrUri)}`,
  );
}

/**
 * Moves a freshly recorded file (in the cache) to its permanent place and returns the relative path
 * to store. With `raw` (Speaker mode: `recordedPath` is the cleaned file), the mic's original
 * recording is moved next to it as `<takeId>.raw.wav`.
 */
export function storeRecordedTake(
  recordedPath: string,
  projectId: string,
  takeId: string,
  raw?: string,
): string {
  const relativePath = takeRelativePath(projectId, takeId);
  const destination = new File(Paths.document, relativePath);
  const parent = destination.parentDirectory;
  parent.create({ intermediates: true, idempotent: true });
  fileAt(recordedPath).move(destination);
  if (raw) fileAt(raw).move(rawTakeFile(relativePath));
  return relativePath;
}

/** A plain cache path for a temporary file (the cleaned take before it's stored). */
export function cacheFilePath(name: string): string {
  return decodeURI(new File(Paths.cache, name).uri.replace(/^file:\/\//, ''));
}

/** Deletes a freshly recorded file that won't be kept (stopped before the punch point). */
export function discardRecordedFile(recordedPath: string): void {
  const file = fileAt(recordedPath);
  if (file.exists) file.delete();
}

/** Deletes a take's audio, raw recording and waveform files. Safe to call when they don't exist. */
export function deleteTakeFiles(relativePath: string): void {
  const files = [new File(Paths.document, relativePath), rawTakeFile(relativePath)];
  for (const file of [...files, peaksFile(relativePath)]) {
    if (file.exists) file.delete();
  }
}

/** Deletes every file of a project. Safe to call when nothing exists. */
export function deleteProjectFiles(projectId: string): void {
  const directory = new Directory(Paths.document, 'projects', projectId);
  if (directory.exists) directory.delete();
}

/**
 * Copies a take's audio (and its raw recording and waveform file, when there are) to another relative
 * path.
 */
export function copyTakeFiles(fromRelativePath: string, toRelativePath: string): void {
  const destination = new File(Paths.document, toRelativePath);
  destination.parentDirectory.create({ intermediates: true, idempotent: true });
  new File(Paths.document, fromRelativePath).copy(destination);
  const raw = rawTakeFile(fromRelativePath);
  if (raw.exists) raw.copy(rawTakeFile(toRelativePath));
  const peaks = peaksFile(fromRelativePath);
  if (peaks.exists) peaks.copy(peaksFile(toRelativePath));
}

/** Bytes used by every idea's audio files. */
export function recordingsSizeBytes(): number {
  const directory = new Directory(Paths.document, 'projects');
  return directory.exists ? (directory.size ?? 0) : 0;
}
