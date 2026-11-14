/**
 * Where take audio files live on disk.
 *
 * Layout: `<documents>/projects/<projectId>/takes/<takeId>.wav`, plus `<takeId>.peaks` (waveform
 * overview, see `@/features/timeline/waveform-peaks`). The database stores the path
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

/** Plain filesystem path (no `file://`), as native audio APIs expect. */
export function takeFilePath(relativePath: string): string {
  return decodeURI(takeUri(relativePath).replace(/^file:\/\//, ''));
}

/**
 * Moves a freshly recorded file (in the cache) to its permanent place and returns the relative path
 * to store.
 */
export function storeRecordedTake(recordedPath: string, projectId: string, takeId: string): string {
  const relativePath = takeRelativePath(projectId, takeId);
  const destination = new File(Paths.document, relativePath);
  const parent = destination.parentDirectory;
  parent.create({ intermediates: true, idempotent: true });
  const source = new File(
    recordedPath.startsWith('file://') ? recordedPath : `file://${encodeURI(recordedPath)}`,
  );
  source.move(destination);
  return relativePath;
}

/** Deletes a freshly recorded file that won't be kept (stopped before the punch point). */
export function discardRecordedFile(recordedPath: string): void {
  const file = new File(
    recordedPath.startsWith('file://') ? recordedPath : `file://${encodeURI(recordedPath)}`,
  );
  if (file.exists) file.delete();
}

/** Deletes a take's audio and waveform files. Safe to call when they don't exist. */
export function deleteTakeFiles(relativePath: string): void {
  for (const file of [new File(Paths.document, relativePath), peaksFile(relativePath)]) {
    if (file.exists) file.delete();
  }
}

/** Deletes every file of a project. Safe to call when nothing exists. */
export function deleteProjectFiles(projectId: string): void {
  const directory = new Directory(Paths.document, 'projects', projectId);
  if (directory.exists) directory.delete();
}
