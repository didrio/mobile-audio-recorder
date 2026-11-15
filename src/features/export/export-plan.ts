/**
 * What an export makes (T36 mix, T37 stems), as pure functions: the time range, which clips each
 * file renders at which track gain, the file names, and the gain that normalizes the result. The
 * runner (`export-runner.ts`) renders the jobs with `@/features/audio/offline-render` and writes
 * the files.
 *
 * Every file of one export covers the same range, so stems all start at the range start and have
 * the same length: dropped into a DAW at 0, they line up.
 */
import type { PlayableClip } from '@/features/audio/audio-engine';
import { hasSolo, trackOutputGain } from '@/features/project/mixer';
import type { Project, Track } from '@/features/projects/projects-repo';

export type ExportKind = 'mix' | 'stems';
export type ExportFormat = 'm4a' | 'wav';
export type Delivery = 'zip' | 'files';

export type RangeChoice = { kind: 'whole' } | { kind: 'loop' } | { kind: 'section'; id: string };

/** A span of the timeline in seconds. */
export type ExportRange = { start: number; end: number };

export type ExportOptions = {
  kind: ExportKind;
  range: RangeChoice;
  format: ExportFormat;
  /** Scale so the loudest file peaks at −1 dBFS (stems all by the same amount). */
  normalize: boolean;
  /** Mix: the metronome is mixed in. */
  includeClick: boolean;
  /** "<Idea> 120 BPM" instead of "<Idea>". */
  addBpm: boolean;
  /** Stems: each at its track's volume (otherwise at 0 dB). */
  applyTrackVolume: boolean;
  /** Stems: muted tracks get a file too. */
  includeMuted: boolean;
  /** Stems extras: a click track, the mix, the tempo map, and how they're delivered. */
  clickStem: boolean;
  includeMix: boolean;
  midi: boolean;
  delivery: Delivery;
};

/** A clip as an export renders it: with the gain of its track in this file. */
export type RenderClip = PlayableClip & { trackGain: number };

/** One audio file to render: these clips (and the click, if `click`) over the export's range. */
export type RenderJob = { fileName: string; clips: RenderClip[]; click: boolean };

export type ExportPlan = {
  range: ExportRange;
  jobs: RenderJob[];
  /** Stems: the tempo map file name (`null`: none) and the info file name. */
  midiName: string | null;
  infoName: string | null;
  /** The zip the files go into; `null`: shared as they are. */
  zipName: string | null;
};

/** Normalize target: the loudest sample lands here. */
export const NORMALIZE_PEAK_DB = -1;

const MAX_NAME_LENGTH = 80;

/** End of the last clip of `tracks` (fades end with their clip), 0 when there are none. */
export function lastClipEnd(tracks: readonly Pick<Project['tracks'][number], 'clips'>[]): number {
  let end = 0;
  for (const track of tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration);
  }
  return end;
}

/**
 * The range a choice stands for: the whole idea (0:00 to the end of the last clip of `tracks`), the
 * loop region, or one section. `null` when it's empty or doesn't exist (no loop region, a deleted
 * section).
 */
export function resolveRange(
  project: Pick<Project, 'loopRegion' | 'sections'>,
  choice: RangeChoice,
  tracks: readonly Pick<Project['tracks'][number], 'clips'>[],
): ExportRange | null {
  let range: ExportRange | null = null;
  if (choice.kind === 'whole') range = { start: 0, end: lastClipEnd(tracks) };
  else if (choice.kind === 'loop') range = project.loopRegion;
  else {
    const section = project.sections.find((candidate) => candidate.id === choice.id);
    if (section) range = { start: section.start, end: section.start + section.duration };
  }
  return range && range.end > range.start ? range : null;
}

/** The number of sample frames a range renders to. All files of an export share it. */
export function frameCount(range: ExportRange, sampleRate: number): number {
  return Math.max(1, Math.round((range.end - range.start) * sampleRate));
}

/** The idea's clips as the engine plays them, for the tracks given, each at `gainOf(track)`. */
export function renderClips(
  project: Pick<Project, 'takes'>,
  tracks: readonly Project['tracks'][number][],
  gainOf: (track: Track) => number,
): RenderClip[] {
  return tracks.flatMap((track) => {
    const trackGain = gainOf(track);
    return track.clips.flatMap((clip) => {
      const take = project.takes[clip.takeId];
      return take
        ? [
            {
              takePath: take.path,
              trackId: track.id,
              start: clip.start,
              offset: clip.offset,
              duration: clip.duration,
              gain: clip.gain,
              fadeIn: clip.fadeIn,
              fadeOut: clip.fadeOut,
              trackGain,
            },
          ]
        : [];
    });
  });
}

/** The mix: every track that's heard (mute, solo and volume as in the mixer). */
export function mixClips(project: Pick<Project, 'tracks' | 'takes'>): RenderClip[] {
  const anySolo = hasSolo(project.tracks);
  return renderClips(
    project,
    project.tracks.filter((track) => trackOutputGain(track, anySolo) > 0),
    (track) => trackOutputGain(track, anySolo),
  );
}

/** Tracks that the mix hears (for the whole-idea range of a mix). */
function audibleTracks(project: Pick<Project, 'tracks'>) {
  const anySolo = hasSolo(project.tracks);
  return project.tracks.filter((track) => trackOutputGain(track, anySolo) > 0);
}

/** Whether a clip sounds somewhere in the range. */
function overlaps(clip: { start: number; duration: number }, range: ExportRange): boolean {
  return clip.start < range.end && clip.start + clip.duration > range.start;
}

/**
 * The tracks that get a stem: in track order, muted ones only with `includeMuted` (solo is ignored:
 * stems are for handing over every part), and only tracks with audio in the range.
 */
export function stemTracks(
  project: Pick<Project, 'tracks'>,
  range: ExportRange,
  includeMuted: boolean,
): Project['tracks'] {
  return project.tracks.filter(
    (track) => (includeMuted || !track.muted) && track.clips.some((clip) => overlaps(clip, range)),
  );
}

/** A name that's safe as a file name on every system: no path or reserved characters. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || 'Untitled';
}

/** The base of an export's file names: the idea's name, with its tempo when asked. */
export function exportBaseName(name: string, bpm: number, addBpm: boolean): string {
  const base = safeFileName(name);
  return addBpm ? `${base} ${Math.round(bpm)} BPM` : base;
}

/** Stem names, numbered by track order: `01 Vocals.wav`, `02 Guitar.wav`. */
export function stemFileNames(tracks: readonly Pick<Track, 'name'>[], extension: string): string[] {
  const digits = Math.max(2, String(tracks.length).length);
  return tracks.map(
    (track, index) =>
      `${String(index + 1).padStart(digits, '0')} ${safeFileName(track.name)}.${extension}`,
  );
}

/** Makes names distinct (case-insensitively, like most file systems): a second `Song.m4a` → `Song 2.m4a`. */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} ${n}${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * Everything one idea's export makes, or `null` when there's nothing to export (no audio in the
 * range, no such range).
 */
export function planExport(project: Project, options: ExportOptions): ExportPlan | null {
  const base = exportBaseName(project.name, project.bpm, options.addBpm);
  const ext = options.format;

  if (options.kind === 'mix') {
    const range = resolveRange(project, options.range, audibleTracks(project));
    const clips = mixClips(project);
    if (!range || !clips.some((clip) => overlaps(clip, range))) return null;
    return {
      range,
      jobs: [{ fileName: `${base}.${ext}`, clips, click: options.includeClick }],
      midiName: null,
      infoName: null,
      zipName: null,
    };
  }

  const candidates = project.tracks.filter((track) => options.includeMuted || !track.muted);
  const range = resolveRange(project, options.range, candidates);
  if (!range) return null;
  const tracks = stemTracks(project, range, options.includeMuted);
  if (tracks.length === 0) return null;

  const stemNames = stemFileNames(tracks, ext);
  const jobs: RenderJob[] = tracks.map((track, index) => ({
    fileName: stemNames[index]!,
    clips: renderClips(project, [track], (t) => (options.applyTrackVolume ? t.volume : 1)),
    click: false,
  }));
  if (options.clickStem) jobs.push({ fileName: `Click.${ext}`, clips: [], click: true });
  if (options.includeMix) {
    jobs.push({ fileName: `${base} (mix).${ext}`, clips: mixClips(project), click: false });
  }
  const names = uniqueNames([
    ...jobs.map((job) => job.fileName),
    options.midi ? `${base} tempo.mid` : '',
    'info.txt',
  ]);
  return {
    range,
    jobs: jobs.map((job, index) => ({ ...job, fileName: names[index]! })),
    midiName: options.midi ? names[jobs.length]! : null,
    infoName: names[names.length - 1]!,
    zipName: options.delivery === 'zip' ? `${base} – stems.zip` : null,
  };
}

/** The sample rate an export renders at: the idea's takes' (the highest), 48 kHz without takes. */
export function exportSampleRate(project: Pick<Project, 'takes'>): number {
  const rates = Object.values(project.takes)
    .map((take) => take.sampleRate)
    .filter((rate) => Number.isFinite(rate) && rate >= 8000);
  return rates.length > 0 ? Math.max(...rates) : 48000;
}

/** Highest absolute sample value (not clamped: above 1 means it would clip). */
export function peakOf(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i] ?? 0);
    if (value > peak) peak = value;
  }
  return peak;
}

/** The gain that puts `peak` at −1 dBFS (1 for silence). */
export function normalizeGain(peak: number): number {
  return peak > 0 ? 10 ** (NORMALIZE_PEAK_DB / 20) / peak : 1;
}

/** Whether audio with this peak clips when written to a file. */
export function wouldClip(peak: number): boolean {
  return peak > 1;
}

/** Multiplies samples by `gain` in place. */
export function applyGain(samples: Float32Array, gain: number): void {
  if (gain === 1) return;
  for (let i = 0; i < samples.length; i++) samples[i]! *= gain;
}

/** `m:ss.mmm` for the info file. */
export function formatExactTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** Sections that start inside the range, at their time in the exported files. */
export function sectionMarkers(
  sections: readonly { name: string; start: number; notes: string }[],
  range: ExportRange,
): { time: number; name: string; notes: string }[] {
  return sections
    .filter((section) => section.start >= range.start - 1e-6 && section.start < range.end)
    .map((section) => ({
      time: Math.max(0, section.start - range.start),
      name: section.name,
      notes: section.notes,
    }));
}

/** Where the range starts on the idea's grid, as "bar 3, beat 1" (1-based). */
export function barBeatAt(seconds: number, bpm: number, beatsPerBar: number): string {
  const beats = Math.round(((seconds * bpm) / 60) * 1000) / 1000;
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = Math.round((beats - (bar - 1) * beatsPerBar + 1) * 100) / 100;
  return `bar ${bar}, beat ${beat}`;
}

/** The `info.txt` of a stems export: tempo, meter, sample rate, the range, sections and notes. */
export function infoText(
  project: Pick<Project, 'name' | 'bpm' | 'beatsPerBar' | 'beatUnit' | 'sections' | 'notes'>,
  plan: Pick<ExportPlan, 'range' | 'jobs'>,
  sampleRate: number,
  rangeLabel: string,
): string {
  const { range } = plan;
  const lines = [
    project.name,
    '',
    `Tempo: ${project.bpm} BPM (a beat is a 1/${project.beatUnit} note)`,
    `Time signature: ${project.beatsPerBar}/${project.beatUnit}`,
    `Sample rate: ${sampleRate} Hz`,
    `Range: ${rangeLabel}, ${formatExactTime(range.start)} – ${formatExactTime(range.end)} of the idea`,
    `Every file starts at ${formatExactTime(range.start)} (${barBeatAt(range.start, project.bpm, project.beatsPerBar)}) and lasts ${formatExactTime(range.end - range.start)}. Place them all at the same spot and they line up.`,
    '',
    'Files:',
    ...plan.jobs.map((job) => `  ${job.fileName}`),
  ];
  const markers = sectionMarkers(project.sections, range);
  if (markers.length > 0) {
    lines.push('', 'Sections (time in the files):');
    for (const marker of markers) {
      lines.push(`  ${formatExactTime(marker.time)}  ${marker.name}`);
      if (marker.notes.trim()) {
        for (const line of marker.notes.trim().split('\n')) lines.push(`             ${line}`);
      }
    }
  }
  if (project.notes.trim()) lines.push('', 'Notes:', project.notes.trim());
  return lines.join('\n') + '\n';
}

/** How a range choice reads ("Whole idea", "Loop region", the section's name). */
export function rangeLabel(project: Pick<Project, 'sections'>, choice: RangeChoice): string {
  if (choice.kind === 'whole') return 'Whole idea';
  if (choice.kind === 'loop') return 'Loop region';
  return project.sections.find((section) => section.id === choice.id)?.name ?? 'Section';
}
