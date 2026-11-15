/**
 * Runs an export (T36 mix, T37 stems and batch): renders each job of the plan (`export-plan.ts`)
 * offline, normalizes, writes WAV (JS) or M4A (native), adds the MIDI tempo map and `info.txt`,
 * zips when asked, and shares the result. Files are written to a fresh folder in the cache that's
 * deleted once the share sheet closes (and leftovers on the next export).
 *
 * Normalize: one gain for the whole export, from the loudest file, so stems keep their balance. With
 * several files that takes a measuring pass first (rendering is fast; keeping every stem in memory
 * isn't).
 */
import { randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { createTakeCache, renderOffline, type TakeCache } from '@/features/audio/offline-render';
import { encodeWav } from '@/features/audio/wav';
import { getProject, type Project } from '@/features/projects/projects-repo';
import { encodeM4A, shareFiles } from '@/lib/audio-export';

import {
  applyGain,
  exportSampleRate,
  infoText,
  normalizeGain,
  peakOf,
  planExport,
  rangeLabel,
  sectionMarkers,
  uniqueNames,
  type ExportFormat,
  type ExportOptions,
  type ExportPlan,
  type ExportRange,
  type RenderJob,
} from './export-plan';
import { tempoMidi } from './tempo-midi';
import { writeZip } from './zip';

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled.');
  }
}

export type ExportProgress = { done: number; total: number; label: string };

/** Set `cancelled` to stop the export at its next step. */
export type CancelToken = { cancelled: boolean };

type RunOptions = { onProgress?: (progress: ExportProgress) => void; token?: CancelToken };

/** The finished files, ready to share (`share`) and then clean up (`cleanUp`). */
export type ExportResult = { files: File[]; folder: Directory };

const EXPORTS_FOLDER = 'exports';

/** Deletes every export's temporary files (left over by a crash; normally each cleans up itself). */
export function clearExportFiles(): void {
  try {
    const folder = new Directory(Paths.cache, EXPORTS_FOLDER);
    if (folder.exists) folder.delete();
  } catch {
    // Nothing to clean, or it's in use: next time.
  }
}

function newFolder(): Directory {
  const folder = new Directory(Paths.cache, EXPORTS_FOLDER, randomUUID());
  folder.create({ intermediates: true, idempotent: true });
  return folder;
}

/** Plain filesystem path of a file (native APIs want no `file://`). */
function plain(file: File): string {
  return decodeURI(file.uri.replace(/^file:\/\//, ''));
}

function check(token: CancelToken | undefined) {
  if (token?.cancelled) throw new ExportCancelled();
}

/** The metronome as the export plays it: the idea's meter and click volume (even if muted visually). */
function clickOf(project: Project) {
  return {
    meter: { bpm: project.bpm, beatsPerBar: project.beatsPerBar, beatUnit: project.beatUnit },
    volume: project.metronomeVolume,
  };
}

function renderJob(project: Project, job: RenderJob, range: ExportRange, takes: TakeCache) {
  return renderOffline({
    clips: job.clips,
    click: job.click ? clickOf(project) : null,
    range,
    takes,
  });
}

/** Writes rendered samples as `fileName` in `folder`, in the export's format. */
async function writeAudio(
  folder: Directory,
  fileName: string,
  samples: Float32Array,
  sampleRate: number,
  format: ExportFormat,
): Promise<File> {
  const wav = encodeWav([samples], sampleRate, 24);
  const file = new File(folder, fileName);
  if (format === 'wav') {
    file.writeSync(wav);
    return file;
  }
  const temporary = new File(folder, `.${randomUUID()}.wav`);
  temporary.writeSync(wav);
  try {
    await encodeM4A(plain(temporary), plain(file));
  } finally {
    temporary.delete();
  }
  return file;
}

/** The loudest sample over every job (the clipping check, and normalizing several files). */
export async function measurePeak(
  project: Project,
  options: ExportOptions,
  run: RunOptions = {},
): Promise<number> {
  const plan = planExport(project, options);
  if (!plan) return 0;
  const takes = createTakeCache(exportSampleRate(project));
  let peak = 0;
  for (const job of plan.jobs) {
    check(run.token);
    peak = Math.max(peak, peakOf(await renderJob(project, job, plan.range, takes)));
  }
  return peak;
}

/** Renders and writes one idea's export. Throws `ExportCancelled` when cancelled. */
export async function exportIdea(
  project: Project,
  options: ExportOptions,
  run: RunOptions = {},
): Promise<ExportResult> {
  const plan = planExport(project, options);
  if (!plan) throw new Error('There’s no audio to export in this range.');
  clearExportFiles();
  const folder = newFolder();
  try {
    const files = await writePlan(project, options, plan, folder, run);
    return { files, folder };
  } catch (error) {
    cleanUp({ files: [], folder });
    throw error;
  }
}

async function writePlan(
  project: Project,
  options: ExportOptions,
  plan: ExportPlan,
  folder: Directory,
  { onProgress, token }: RunOptions,
): Promise<File[]> {
  const sampleRate = exportSampleRate(project);
  const takes = createTakeCache(sampleRate);
  const several = plan.jobs.length > 1;
  const measuring = options.normalize && several;
  const total = plan.jobs.length * (measuring ? 2 : 1) + (plan.zipName ? 1 : 0);
  let done = 0;
  const step = (label: string) => onProgress?.({ done, total, label });

  // Normalize: one gain for every file, from the loudest (several files need a measuring pass).
  let gain = 1;
  if (measuring) {
    let peak = 0;
    for (const job of plan.jobs) {
      check(token);
      step(`Measuring ${job.fileName}`);
      peak = Math.max(peak, peakOf(await renderJob(project, job, plan.range, takes)));
      done++;
    }
    gain = normalizeGain(peak);
  }

  const files: File[] = [];
  for (const job of plan.jobs) {
    check(token);
    step(several ? `Rendering ${job.fileName}` : 'Rendering');
    const samples = await renderJob(project, job, plan.range, takes);
    if (options.normalize && !several) gain = normalizeGain(peakOf(samples));
    applyGain(samples, gain);
    check(token);
    files.push(await writeAudio(folder, job.fileName, samples, sampleRate, options.format));
    done++;
  }

  if (plan.midiName) {
    const midi = new File(folder, plan.midiName);
    midi.writeSync(
      tempoMidi({
        name: project.name,
        bpm: project.bpm,
        beatsPerBar: project.beatsPerBar,
        beatUnit: project.beatUnit,
        markers: sectionMarkers(project.sections, plan.range),
        length: plan.range.end - plan.range.start,
      }),
    );
    files.push(midi);
  }
  if (plan.infoName) {
    const info = new File(folder, plan.infoName);
    info.writeSync(infoText(project, plan, sampleRate, rangeLabel(project, options.range)));
    files.push(info);
  }

  if (!plan.zipName) return files;
  check(token);
  step('Zipping');
  return [zipFiles(folder, plan.zipName, files)];
}

/** Zips `files` (flat, by name) into `zipName` in `folder`, then deletes them. */
function zipFiles(folder: Directory, zipName: string, files: File[]): File {
  const zip = new File(folder, zipName);
  zip.create({ overwrite: true });
  const handle = zip.open(FileMode.WriteOnly);
  try {
    writeZip(
      files.map((file) => ({ name: file.name, read: () => file.bytesSync() })),
      (chunk) => handle.writeBytesSync(chunk),
    );
  } finally {
    handle.close();
  }
  for (const file of files) file.delete();
  return zip;
}

export type BatchOptions = Pick<ExportOptions, 'format' | 'normalize' | 'addBpm'>;

/** The options a batch export uses for each idea: its whole mix. */
export function batchIdeaOptions(options: BatchOptions): ExportOptions {
  return {
    ...options,
    kind: 'mix',
    range: { kind: 'whole' },
    includeClick: false,
    applyTrackVolume: true,
    includeMuted: false,
    clickStem: false,
    includeMix: false,
    midi: false,
    delivery: 'zip',
  };
}

/**
 * Batch export (T37): the whole mix of each idea, into one zip (or just the file when only one idea
 * has audio). Ideas without audio are skipped. Same-named ideas get distinct names.
 */
export async function exportIdeas(
  ids: readonly string[],
  options: BatchOptions,
  { onProgress, token }: RunOptions = {},
): Promise<ExportResult> {
  clearExportFiles();
  const folder = newFolder();
  const ideaOptions = batchIdeaOptions(options);
  const files: File[] = [];
  const used: string[] = [];
  try {
    for (const [index, id] of ids.entries()) {
      check(token);
      const project = await getProject(id);
      onProgress?.({ done: index, total: ids.length + 1, label: project?.name ?? 'Idea' });
      const plan = project && planExport(project, ideaOptions);
      const job = plan?.jobs[0];
      if (!project || !plan || !job) continue;
      const sampleRate = exportSampleRate(project);
      const samples = await renderJob(project, job, plan.range, createTakeCache(sampleRate));
      if (options.normalize) applyGain(samples, normalizeGain(peakOf(samples)));
      const name = uniqueNames([...used, job.fileName])[used.length]!;
      used.push(name);
      check(token);
      files.push(await writeAudio(folder, name, samples, sampleRate, options.format));
    }
    if (files.length === 0) throw new Error('None of these ideas has audio to export.');
    if (files.length === 1) return { files, folder };
    check(token);
    onProgress?.({ done: ids.length, total: ids.length + 1, label: 'Zipping' });
    return { files: [zipFiles(folder, `${files.length} ideas.zip`, files)], folder };
  } catch (error) {
    cleanUp({ files: [], folder });
    throw error;
  }
}

const MIME_TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  zip: 'application/zip',
  mid: 'audio/midi',
  txt: 'text/plain',
};

/** Opens the share sheet for the result; resolves when it closes. */
export async function share(result: ExportResult): Promise<void> {
  const [first, ...rest] = result.files;
  if (!first) return;
  if (rest.length > 0) {
    await shareFiles(result.files.map(plain));
    return;
  }
  await Sharing.shareAsync(first.uri, {
    // iOS picks the type from the extension; a MIME type there would add a second extension.
    ...(Platform.OS === 'android' && {
      mimeType: MIME_TYPES[first.extension.replace('.', '').toLowerCase()],
    }),
    dialogTitle: first.name,
  });
}

/** Deletes an export's files. */
export function cleanUp(result: ExportResult): void {
  try {
    if (result.folder.exists) result.folder.delete();
  } catch {
    // Already gone, or the next export's `clearExportFiles` gets it.
  }
}
