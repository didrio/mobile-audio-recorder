/**
 * The editor's commands as pure functions: each turns the open project and an input into an `Edit`
 * (`edit-changes.ts`), or `null` when there's nothing to do. The store applies, saves and records them.
 */
import { randomUUID } from 'expo-crypto';

import { clampBpm } from '@/features/audio/tempo';
import { clearRange } from '@/features/projects/clip-overlap';
import type {
  Clip,
  IdeaSettings,
  Project,
  Section,
  Take,
  Track,
} from '@/features/projects/projects-repo';
import { moveIndex } from '@/features/timeline/reorder-math';
import { clampSection, neighborBounds, type SectionWindow } from '@/features/timeline/section-math';

import { ideaSettings, trackRow, type Change, type Edit } from './edit-changes';
import { MIN_SECTION_SECONDS, SECTION_NAME_MAX, type SectionColor } from './sections';

/** Adds an empty track after the last one, named "Track N". */
export function addTrackEdit(project: Project): { edit: Edit; trackId: string } {
  const position = Math.max(-1, ...project.tracks.map((track) => track.position)) + 1;
  const trackId = randomUUID();
  return {
    trackId,
    edit: {
      label: 'Add track',
      changes: [
        {
          table: 'tracks',
          id: trackId,
          before: null,
          after: {
            id: trackId,
            projectId: project.id,
            position,
            name: `Track ${position + 1}`,
            volume: 1,
            muted: false,
            solo: false,
          },
        },
      ],
    },
  };
}

/** Renames a track; an empty or unchanged name does nothing. */
export function renameTrackEdit(project: Project, trackId: string, name: string): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  const trimmed = name.trim();
  if (!track || !trimmed || trimmed === track.name) return null;
  const before = trackRow(track);
  return {
    label: 'Rename track',
    changes: [{ table: 'tracks', id: trackId, before, after: { ...before, name: trimmed } }],
  };
}

/**
 * Moves a track to index `toIndex` in the track order (the others close up behind it). The tracks keep
 * the position values they already have, handed out again in the new order, so the highest position
 * (and `addTrackEdit`'s "Track N" naming) doesn't change. Only tracks whose position changes are in
 * the edit. `null` for a missing track or when it's already at `toIndex`.
 */
export function moveTrackEdit(project: Project, trackId: string, toIndex: number): Edit | null {
  const from = project.tracks.findIndex((track) => track.id === trackId);
  const to = Math.min(Math.max(0, Math.round(toIndex)), project.tracks.length - 1);
  if (from < 0 || from === to) return null;
  const positions = project.tracks.map((track) => track.position).sort((a, b) => a - b);
  const changes: Change[] = [];
  moveIndex(project.tracks, from, to).forEach((track, index) => {
    const position = positions[index] as number;
    if (track.position === position) return;
    const before = trackRow(track);
    changes.push({ table: 'tracks', id: track.id, before, after: { ...before, position } });
  });
  return { label: 'Move track', changes };
}

/** Sets a track's volume (linear gain, 1 = 0 dB); an unchanged or invalid volume does nothing. */
export function setTrackVolumeEdit(project: Project, trackId: string, volume: number): Edit | null {
  if (!Number.isFinite(volume) || volume < 0) return null;
  return trackSettingEdit(project, trackId, { volume }, 'Track volume');
}

export function setTrackMutedEdit(project: Project, trackId: string, muted: boolean): Edit | null {
  return trackSettingEdit(project, trackId, { muted }, muted ? 'Mute' : 'Unmute');
}

export function setTrackSoloEdit(project: Project, trackId: string, solo: boolean): Edit | null {
  return trackSettingEdit(project, trackId, { solo }, solo ? 'Solo' : 'Unsolo');
}

/** Changes mixer settings of a track's row; `null` when the track is missing or nothing changes. */
function trackSettingEdit(
  project: Project,
  trackId: string,
  settings: Partial<Pick<Track, 'volume' | 'muted' | 'solo'>>,
  label: string,
): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return null;
  const before = trackRow(track);
  const after = { ...before, ...settings };
  if (
    after.volume === before.volume &&
    after.muted === before.muted &&
    after.solo === before.solo
  ) {
    return null;
  }
  return { label, changes: [{ table: 'tracks', id: trackId, before, after }] };
}

/**
 * Deletes a track with its clips (listed one by one, so undo puts them back). Their takes stay. An
 * idea always keeps at least one track, so deleting the last one does nothing.
 */
export function deleteTrackEdit(project: Project, trackId: string): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track || project.tracks.length <= 1) return null;
  return {
    label: 'Delete track',
    changes: [
      ...track.clips.map((clip): Change => ({
        table: 'clips',
        id: clip.id,
        before: clip,
        after: null,
      })),
      { table: 'tracks', id: trackId, before: trackRow(track), after: null },
    ],
  };
}

export type RecordedTakeInput = {
  trackId: string;
  take: Pick<Take, 'id' | 'duration'>;
  /** Timeline position of the clip. */
  start: number;
  /** Seconds skipped at the take's start (default 0). */
  offset?: number;
};

/**
 * Places a recorded take on a track as one clip from `offset` to the take's end. The new clip replaces
 * whatever was under it on that track: overlapped clips are trimmed or split (`clip-overlap.ts`).
 * `null` if the track doesn't exist.
 */
export function recordTakeEdit(project: Project, input: RecordedTakeInput): Edit | null {
  const track = project.tracks.find((candidate) => candidate.id === input.trackId);
  if (!track) return null;
  const offset = Math.min(Math.max(0, input.offset ?? 0), input.take.duration);
  const start = Math.max(0, input.start);
  const duration = input.take.duration - offset;

  const changes = clearRangeChanges(track.clips, start, start + duration);
  const clipId = randomUUID();
  changes.push({
    table: 'clips',
    id: clipId,
    before: null,
    after: {
      id: clipId,
      trackId: track.id,
      takeId: input.take.id,
      start,
      offset,
      duration,
      ...PLAIN_CLIP,
    },
  });
  return { label: 'Record', changes };
}

/** Clip options of a new recording: 0 dB, no fades (T16). */
const PLAIN_CLIP = { gain: 1, fadeIn: 0, fadeOut: 0 } as const;

/**
 * The changes that clear `from…to` on a track holding `clips`: overlapped clips are trimmed, split or
 * deleted (`clip-overlap.ts`). Leave out the clip being placed. An edge made by the cut has no fade
 * (a fade stays with the edge it was set on); gain is kept.
 */
function clearRangeChanges(clips: Clip[], from: number, to: number): Change[] {
  const changes: Change[] = [];
  for (const edit of clearRange(clips, from, to)) {
    const clip = clips.find((candidate) => candidate.id === edit.id);
    if (!clip) continue;
    if (edit.kind === 'delete') {
      changes.push({ table: 'clips', id: clip.id, before: clip, after: null });
    } else if (edit.kind === 'update') {
      const keepsHead = edit.start === clip.start;
      const after: Clip = {
        ...clip,
        start: edit.start,
        offset: edit.offset,
        duration: edit.duration,
        fadeIn: keepsHead ? clip.fadeIn : 0,
        fadeOut: keepsHead ? 0 : clip.fadeOut,
      };
      changes.push({ table: 'clips', id: clip.id, before: clip, after });
    } else {
      const tailId = randomUUID();
      const head: Clip = { ...clip, duration: edit.duration, fadeOut: 0 };
      const tail: Clip = { ...clip, id: tailId, ...edit.tail, fadeIn: 0 };
      changes.push(
        { table: 'clips', id: clip.id, before: clip, after: head },
        { table: 'clips', id: tailId, before: null, after: tail },
      );
    }
  }
  return changes;
}

/** Shortest clip a trim or split leaves (seconds). */
export const MIN_CLIP_SECONDS = 0.05;

/** A clip's place on the timeline: its track and its window onto its take. */
export type ClipPlacement = Pick<Clip, 'trackId' | 'start' | 'offset' | 'duration'>;

function findClip(project: Project, clipId: string): Clip | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

/**
 * Moves and/or trims a clip (a drag of the clip or of one of its handles): it gets `placement`, kept
 * within its take (a head before the take's start is cut back to it, a tail ends by the take's end), at least `MIN_CLIP_SECONDS` long and not
 * before 0:00. Whatever it lands on on its (new) track is replaced, as recording does. `null` for a
 * missing clip or track, or when nothing changes.
 */
export function placeClipEdit(
  project: Project,
  clipId: string,
  placement: ClipPlacement,
  label = 'Move clip',
): Edit | null {
  const clip = findClip(project, clipId);
  const track = project.tracks.find((candidate) => candidate.id === placement.trackId);
  if (!clip || !track) return null;
  const takeDuration = project.takes[clip.takeId]?.duration ?? Infinity;
  // A head reaching before the take's start is cut back to it, keeping the audio where it was.
  const before = Math.max(0, -placement.offset);
  const offset = Math.min(placement.offset + before, Math.max(0, takeDuration - MIN_CLIP_SECONDS));
  const duration = Math.min(
    Math.max(MIN_CLIP_SECONDS, placement.duration - before),
    takeDuration - offset,
  );
  const start = Math.max(0, placement.start + before);
  const after: Clip = { ...clip, trackId: track.id, start, offset, duration };
  if (
    after.trackId === clip.trackId &&
    after.start === clip.start &&
    after.offset === clip.offset &&
    after.duration === clip.duration
  ) {
    return null;
  }
  const others = track.clips.filter((candidate) => candidate.id !== clipId);
  return {
    label,
    changes: [
      ...clearRangeChanges(others, start, start + duration),
      { table: 'clips', id: clipId, before: clip, after },
    ],
  };
}

/**
 * Splits a clip at timeline position `at` into two clips on the same take: the original keeps the
 * head, a new clip the tail. `null` unless both pieces would be at least `MIN_CLIP_SECONDS` long.
 */
export function splitClipEdit(
  project: Project,
  clipId: string,
  at: number,
): { edit: Edit; tailId: string } | null {
  const clip = findClip(project, clipId);
  if (!clip || !canSplitAt(clip, at)) return null;
  const head = at - clip.start;
  const tailId = randomUUID();
  // Both pieces keep the gain; the fades stay on the outer edges (the split point plays straight through).
  const tail: Clip = {
    ...clip,
    id: tailId,
    start: at,
    offset: clip.offset + head,
    duration: clip.duration - head,
    fadeIn: 0,
  };
  return {
    tailId,
    edit: {
      label: 'Split clip',
      changes: [
        {
          table: 'clips',
          id: clipId,
          before: clip,
          after: { ...clip, duration: head, fadeOut: 0 },
        },
        { table: 'clips', id: tailId, before: null, after: tail },
      ],
    },
  };
}

/** Whether splitting `clip` at `at` leaves two pieces of at least `MIN_CLIP_SECONDS`. */
export function canSplitAt(clip: Pick<Clip, 'start' | 'duration'>, at: number): boolean {
  'worklet';
  return at - clip.start >= MIN_CLIP_SECONDS && clip.start + clip.duration - at >= MIN_CLIP_SECONDS;
}

/** Copies a clip to right after itself on the same track (replacing what's there). */
export function duplicateClipEdit(
  project: Project,
  clipId: string,
): { edit: Edit; copyId: string } | null {
  const clip = findClip(project, clipId);
  const track = project.tracks.find((candidate) => candidate.id === clip?.trackId);
  if (!clip || !track) return null;
  const copyId = randomUUID();
  const start = clip.start + clip.duration;
  const copy: Clip = { ...clip, id: copyId, start };
  const others = track.clips.filter((candidate) => candidate.id !== clipId);
  return {
    copyId,
    edit: {
      label: 'Duplicate clip',
      changes: [
        ...clearRangeChanges(others, start, start + clip.duration),
        { table: 'clips', id: copyId, before: null, after: copy },
      ],
    },
  };
}

/** The per-clip options of the Options sheet (T16). */
export type ClipOptions = Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut'>;

/** Longest fade the Options sheet offers (seconds); longer values are clamped. */
export const MAX_FADE_SECONDS = 10;

/**
 * Changes a clip's gain and/or fades (one undo step). Gain is clamped to 0…`maxGain`, fades to
 * 0…`MAX_FADE_SECONDS`. `null` for a missing clip or when nothing changes.
 */
export function setClipOptionsEdit(
  project: Project,
  clipId: string,
  patch: Partial<ClipOptions>,
  { label = 'Clip options', maxGain = Infinity }: { label?: string; maxGain?: number } = {},
): Edit | null {
  const clip = findClip(project, clipId);
  if (!clip) return null;
  const fade = (value: number | undefined, current: number) =>
    value === undefined || !Number.isFinite(value)
      ? current
      : Math.min(Math.max(0, value), MAX_FADE_SECONDS);
  const after: Clip = {
    ...clip,
    gain:
      patch.gain === undefined || !Number.isFinite(patch.gain)
        ? clip.gain
        : Math.min(Math.max(0, patch.gain), maxGain),
    fadeIn: fade(patch.fadeIn, clip.fadeIn),
    fadeOut: fade(patch.fadeOut, clip.fadeOut),
  };
  if (after.gain === clip.gain && after.fadeIn === clip.fadeIn && after.fadeOut === clip.fadeOut) {
    return null;
  }
  return { label, changes: [{ table: 'clips', id: clipId, before: clip, after }] };
}

/**
 * Where "Restore full take" would put the clip: its whole take at the same alignment (the audio stays
 * where it is), cut back so it doesn't reach before 0:00 or into its neighbors on the track. `null`
 * when that is no bigger than the clip already is (nothing to restore, or no room).
 */
export function restoredClipWindow(
  project: Project,
  clipId: string,
): Pick<Clip, 'start' | 'offset' | 'duration'> | null {
  const clip = findClip(project, clipId);
  const take = clip ? project.takes[clip.takeId] : undefined;
  const track = project.tracks.find((candidate) => candidate.id === clip?.trackId);
  if (!clip || !take || !track) return null;
  const takeStart = clip.start - clip.offset;
  const clipEnd = clip.start + clip.duration;
  let floor = 0;
  let ceiling = Infinity;
  for (const other of track.clips) {
    if (other.id === clip.id) continue;
    const otherEnd = other.start + other.duration;
    if (otherEnd <= clip.start + 1e-9) floor = Math.max(floor, otherEnd);
    else if (other.start >= clipEnd - 1e-9) ceiling = Math.min(ceiling, other.start);
  }
  const start = Math.min(clip.start, Math.max(takeStart, floor));
  const end = Math.max(clipEnd, Math.min(takeStart + take.duration, ceiling));
  if (start >= clip.start - 1e-9 && end <= clipEnd + 1e-9) return null;
  return { start, offset: start - takeStart, duration: end - start };
}

/** "Restore full take": the clip grows back towards its whole take (`restoredClipWindow`). */
export function restoreClipEdit(project: Project, clipId: string): Edit | null {
  const clip = findClip(project, clipId);
  const window = restoredClipWindow(project, clipId);
  if (!clip || !window) return null;
  return {
    label: 'Restore full take',
    changes: [{ table: 'clips', id: clipId, before: clip, after: { ...clip, ...window } }],
  };
}

/** Deletes a clip (its take stays until the idea is next opened without it in use). */
export function deleteClipEdit(project: Project, clipId: string): Edit | null {
  const clip = findClip(project, clipId);
  if (!clip) return null;
  return {
    label: 'Delete clip',
    changes: [{ table: 'clips', id: clipId, before: clip, after: null }],
  };
}

/**
 * Changes the idea's name, tempo, time signature, grid and/or metronome volume and output in one step. A blank name is ignored and the
 * tempo is clamped; setting a tempo that differs from the current one turns the grid on, unless the same
 * patch says otherwise. `null` when nothing would change.
 */
export function setIdeaSettingsEdit(project: Project, patch: Partial<IdeaSettings>): Edit | null {
  const before = ideaSettings(project);
  const after = { ...before };
  const name = patch.name?.trim();
  if (name) after.name = name;
  if (patch.bpm !== undefined) {
    after.bpm = clampBpm(patch.bpm);
    if (after.bpm !== before.bpm) after.grid = true;
  }
  if (patch.beatsPerBar !== undefined) after.beatsPerBar = patch.beatsPerBar;
  if (patch.beatUnit !== undefined) after.beatUnit = patch.beatUnit;
  if (patch.grid !== undefined) after.grid = patch.grid;
  if (patch.metronomeVolume !== undefined && Number.isFinite(patch.metronomeVolume)) {
    after.metronomeVolume = Math.max(0, patch.metronomeVolume);
  }
  if (patch.metronomeOutput !== undefined) after.metronomeOutput = patch.metronomeOutput;
  if (
    after.name === before.name &&
    after.bpm === before.bpm &&
    after.beatsPerBar === before.beatsPerBar &&
    after.beatUnit === before.beatUnit &&
    after.grid === before.grid &&
    after.metronomeVolume === before.metronomeVolume &&
    after.metronomeOutput === before.metronomeOutput
  ) {
    return null;
  }
  return {
    label: 'Idea settings',
    changes: [{ table: 'projects', id: project.id, before, after }],
  };
}

// Sections (T18)

export type NewSection = SectionWindow & { name: string; color: SectionColor };

/**
 * Adds a section, cut short where the next one starts (it never overlaps another; a start inside a
 * section moves to that section's end). `null` for a blank name or when less than `MIN_SECTION_SECONDS` fits.
 */
export function addSectionEdit(
  project: Project,
  input: NewSection,
): { edit: Edit; sectionId: string } | null {
  const name = input.name.trim().slice(0, SECTION_NAME_MAX);
  if (!name) return null;
  let min = 0;
  let max = Infinity;
  const start = Math.max(0, input.start);
  for (const other of project.sections) {
    if (other.start <= start) min = Math.max(min, other.start + other.duration);
    else max = Math.min(max, other.start);
  }
  const from = Math.max(start, min);
  const window = { start: from, duration: Math.min(input.duration, max - from) };
  if (!(window.duration >= MIN_SECTION_SECONDS)) return null;
  const sectionId = randomUUID();
  const section: Section = {
    id: sectionId,
    projectId: project.id,
    name,
    color: input.color,
    start: window.start,
    duration: window.duration,
    notes: '',
  };
  return {
    sectionId,
    edit: {
      label: 'Add section',
      changes: [{ table: 'sections', id: sectionId, before: null, after: section }],
    },
  };
}

/**
 * Moves and/or resizes a section (a drag ending): at least `MIN_SECTION_SECONDS` long where there's
 * room, not before 0:00, and kept between its neighbors. `null` for a missing section or no change.
 */
export function placeSectionEdit(
  project: Project,
  sectionId: string,
  window: SectionWindow,
  label = 'Move section',
): Edit | null {
  const index = project.sections.findIndex((candidate) => candidate.id === sectionId);
  const section = project.sections[index];
  if (!section) return null;
  const bounds = neighborBounds(project.sections, index);
  const room = bounds.max - bounds.min;
  const placed = clampSection(
    {
      start: window.start,
      duration: Math.max(window.duration, Math.min(MIN_SECTION_SECONDS, room)),
    },
    bounds,
  );
  if (placed.start === section.start && placed.duration === section.duration) return null;
  return {
    label,
    changes: [
      { table: 'sections', id: sectionId, before: section, after: { ...section, ...placed } },
    ],
  };
}

/** Renames a section; a blank or unchanged name does nothing. */
export function renameSectionEdit(project: Project, sectionId: string, name: string): Edit | null {
  const trimmed = name.trim().slice(0, SECTION_NAME_MAX);
  return trimmed ? sectionFieldEdit(project, sectionId, { name: trimmed }, 'Rename section') : null;
}

export function setSectionColorEdit(
  project: Project,
  sectionId: string,
  color: SectionColor,
): Edit | null {
  return sectionFieldEdit(project, sectionId, { color }, 'Section color');
}

/** Sets a section's note ('' clears it; trailing whitespace is dropped). */
export function setSectionNotesEdit(
  project: Project,
  sectionId: string,
  notes: string,
): Edit | null {
  return sectionFieldEdit(project, sectionId, { notes: notes.trimEnd() }, 'Section notes');
}

function sectionFieldEdit(
  project: Project,
  sectionId: string,
  fields: Partial<Pick<Section, 'name' | 'color' | 'notes'>>,
  label: string,
): Edit | null {
  const section = project.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return null;
  const after = { ...section, ...fields };
  if (
    after.name === section.name &&
    after.color === section.color &&
    after.notes === section.notes
  ) {
    return null;
  }
  return { label, changes: [{ table: 'sections', id: sectionId, before: section, after }] };
}

export function deleteSectionEdit(project: Project, sectionId: string): Edit | null {
  const section = project.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return null;
  return {
    label: 'Delete section',
    changes: [{ table: 'sections', id: sectionId, before: section, after: null }],
  };
}
