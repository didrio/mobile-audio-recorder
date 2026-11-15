import { testClip, testProject, testSection, testTrack } from '@/features/project/edit-test-data';
import type { Project } from '@/features/projects/projects-repo';

import {
  barBeatAt,
  exportBaseName,
  exportSampleRate,
  formatExactTime,
  frameCount,
  infoText,
  mixClips,
  normalizeGain,
  planExport,
  resolveRange,
  safeFileName,
  stemFileNames,
  uniqueNames,
  wouldClip,
  type ExportOptions,
} from './export-plan';

const take = (id: string, sampleRate = 48000) => ({
  id,
  projectId: 'p1',
  path: `projects/p1/takes/${id}.wav`,
  duration: 60,
  sampleRate,
  channels: 1,
  createdAt: 0,
});

const options = (changes: Partial<ExportOptions> = {}): ExportOptions => ({
  kind: 'mix',
  range: { kind: 'whole' },
  format: 'm4a',
  normalize: true,
  includeClick: false,
  addBpm: false,
  applyTrackVolume: true,
  includeMuted: false,
  clickStem: false,
  includeMix: false,
  midi: false,
  delivery: 'zip',
  ...changes,
});

/** Vocals 0–10 s, Guitar 2–14 s (muted), Bass 5–8 s at half volume; a Verse and a Chorus section. */
function song(): Project {
  const vocals = { ...testTrack('t1', 0, [testClip('c1', 't1', 0, 10)]), name: 'Vocals' };
  const guitar = {
    ...testTrack('t2', 1, [testClip('c2', 't2', 2, 12)]),
    name: 'Guitar',
    muted: true,
  };
  const bass = {
    ...testTrack('t3', 2, [testClip('c3', 't3', 5, 3)]),
    name: 'Bass',
    volume: 0.5,
  };
  return {
    ...testProject(
      [vocals, guitar, bass],
      [testSection('s1', 'Verse', 0, 4), testSection('s2', 'Chorus', 4, 6)],
    ),
    name: 'Night drive',
    takes: { take1: take('take1') },
  };
}

describe('ranges', () => {
  it('whole idea runs from 0:00 to the end of the last clip of the tracks given', () => {
    const project = song();
    expect(resolveRange(project, { kind: 'whole' }, project.tracks)).toEqual({
      start: 0,
      end: 14,
    });
    expect(resolveRange(project, { kind: 'whole' }, [project.tracks[0]!])).toEqual({
      start: 0,
      end: 10,
    });
  });

  it('a mix of the whole idea ends with the last clip that is heard', () => {
    // The muted guitar runs to 14 s, but the mix ends with the vocals at 10 s.
    expect(planExport(song(), options())?.range).toEqual({ start: 0, end: 10 });
  });

  it('uses the loop region or a section, and nothing when there is none', () => {
    const project = { ...song(), loopRegion: { start: 2, end: 6 } };
    expect(resolveRange(project, { kind: 'loop' }, project.tracks)).toEqual({ start: 2, end: 6 });
    expect(resolveRange(project, { kind: 'section', id: 's2' }, project.tracks)).toEqual({
      start: 4,
      end: 10,
    });
    expect(resolveRange(song(), { kind: 'loop' }, project.tracks)).toBeNull();
    expect(resolveRange(project, { kind: 'section', id: 'gone' }, project.tracks)).toBeNull();
    expect(resolveRange(testProject([testTrack('t', 0)]), { kind: 'whole' }, [])).toBeNull();
  });

  it('frames: the same count for every file of an export', () => {
    expect(frameCount({ start: 4, end: 10 }, 48000)).toBe(288000);
    expect(frameCount({ start: 0, end: 1 / 3 }, 44100)).toBe(14700);
  });
});

describe('the mix', () => {
  it('plays tracks at their mixer gain and leaves out what is not heard', () => {
    const clips = mixClips(song());
    expect(clips.map((clip) => [clip.trackId, clip.trackGain])).toEqual([
      ['t1', 1],
      ['t3', 0.5],
    ]);
    expect(clips[0]).toMatchObject({ takePath: 'projects/p1/takes/take1.wav', start: 0 });
  });

  it('follows solo', () => {
    const project = song();
    project.tracks[2]!.solo = true;
    expect(mixClips(project).map((clip) => clip.trackId)).toEqual(['t3']);
  });

  it('is one file named after the idea, with the click when asked', () => {
    const plan = planExport(song(), options({ includeClick: true, addBpm: true }))!;
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]).toMatchObject({ fileName: 'Night drive 120 BPM.m4a', click: true });
    expect(plan.zipName).toBeNull();
    expect(plan.infoName).toBeNull();
  });

  it('is nothing when the range has no audio', () => {
    const project = { ...song(), sections: [testSection('s', 'Outro', 20, 4)] };
    expect(planExport(project, options({ range: { kind: 'section', id: 's' } }))).toBeNull();
  });
});

describe('stems', () => {
  it('gives every stem the same range, so they line up and have the same length', () => {
    const plan = planExport(
      song(),
      options({ kind: 'stems', includeMuted: true, range: { kind: 'section', id: 's2' } }),
    )!;
    expect(plan.range).toEqual({ start: 4, end: 10 });
    expect(plan.jobs.map((job) => job.fileName)).toEqual([
      '01 Vocals.m4a',
      '02 Guitar.m4a',
      '03 Bass.m4a',
    ]);
    // One range for the export: every stem renders frameCount(range) frames from the range start.
    expect(new Set(plan.jobs.map(() => frameCount(plan.range, 48000)))).toEqual(new Set([288000]));
  });

  it('a whole-idea stem export runs to the last clip of the exported tracks', () => {
    expect(planExport(song(), options({ kind: 'stems', includeMuted: true }))!.range).toEqual({
      start: 0,
      end: 14,
    });
    expect(planExport(song(), options({ kind: 'stems' }))!.range).toEqual({ start: 0, end: 10 });
  });

  it('skips muted tracks unless asked, and applies track volume when asked', () => {
    const plan = planExport(song(), options({ kind: 'stems' }))!;
    expect(plan.jobs.map((job) => job.fileName)).toEqual(['01 Vocals.m4a', '02 Bass.m4a']);
    expect(plan.jobs[1]!.clips[0]!.trackGain).toBe(0.5);
    const flat = planExport(song(), options({ kind: 'stems', applyTrackVolume: false }))!;
    expect(flat.jobs[1]!.clips[0]!.trackGain).toBe(1);
  });

  it('leaves out tracks with no audio in the range', () => {
    const plan = planExport(
      song(),
      options({ kind: 'stems', range: { kind: 'section', id: 's1' } }),
    )!;
    expect(plan.jobs.map((job) => job.fileName)).toEqual(['01 Vocals.m4a']);
  });

  it('adds the extras and the zip', () => {
    const plan = planExport(
      song(),
      options({ kind: 'stems', format: 'wav', clickStem: true, includeMix: true, midi: true }),
    )!;
    expect(plan.jobs.map((job) => [job.fileName, job.click, job.clips.length])).toEqual([
      ['01 Vocals.wav', false, 1],
      ['02 Bass.wav', false, 1],
      ['Click.wav', true, 0],
      ['Night drive (mix).wav', false, 2],
    ]);
    expect(plan.midiName).toBe('Night drive tempo.mid');
    expect(plan.infoName).toBe('info.txt');
    expect(plan.zipName).toBe('Night drive – stems.zip');
    expect(planExport(song(), options({ kind: 'stems', delivery: 'files' }))!.zipName).toBeNull();
  });

  it('keeps same-named tracks and files distinct', () => {
    const project = song();
    project.tracks[2]!.name = 'Vocals';
    project.tracks[0]!.name = 'Click';
    const plan = planExport(project, options({ kind: 'stems', clickStem: true }))!;
    expect(plan.jobs.map((job) => job.fileName)).toEqual([
      '01 Click.m4a',
      '02 Vocals.m4a',
      'Click.m4a',
    ]);
  });
});

describe('names', () => {
  it('makes names safe for any file system', () => {
    expect(safeFileName('  AC/DC: "Live"?  ')).toBe('AC-DC- -Live--');
    expect(safeFileName('..hidden')).toBe('hidden');
    expect(safeFileName('   ')).toBe('Untitled');
    expect(safeFileName('x'.repeat(200))).toHaveLength(80);
  });

  it('adds the tempo when asked', () => {
    expect(exportBaseName('Song', 92.4, true)).toBe('Song 92 BPM');
    expect(exportBaseName('Song', 92, false)).toBe('Song');
  });

  it('numbers stems by track order, with three digits past 99 tracks', () => {
    expect(stemFileNames([{ name: 'Vox' }, { name: 'Gtr' }], 'wav')).toEqual([
      '01 Vox.wav',
      '02 Gtr.wav',
    ]);
    const many = stemFileNames(
      Array.from({ length: 100 }, () => ({ name: 'T' })),
      'wav',
    );
    expect(many[0]).toBe('001 T.wav');
  });

  it('de-duplicates names like a file system would', () => {
    expect(uniqueNames(['Song.m4a', 'song.m4a', 'Song.m4a', 'Other'])).toEqual([
      'Song.m4a',
      'song 2.m4a',
      'Song 3.m4a',
      'Other',
    ]);
  });
});

describe('levels', () => {
  it('normalizes the peak to −1 dBFS', () => {
    expect(normalizeGain(0.5) * 0.5).toBeCloseTo(10 ** (-1 / 20));
    expect(normalizeGain(0)).toBe(1);
  });

  it('knows when a file would clip', () => {
    expect(wouldClip(1)).toBe(false);
    expect(wouldClip(1.01)).toBe(true);
  });
});

describe('info', () => {
  it('uses the takes’ sample rate', () => {
    expect(exportSampleRate(song())).toBe(48000);
    expect(exportSampleRate({ takes: {} })).toBe(48000);
    expect(exportSampleRate({ takes: { a: take('a', 44100) } })).toBe(44100);
  });

  it('formats exact times and grid positions', () => {
    expect(formatExactTime(64.0625)).toBe('1:04.063');
    expect(barBeatAt(0, 120, 4)).toBe('bar 1, beat 1');
    expect(barBeatAt(4, 120, 4)).toBe('bar 3, beat 1');
    expect(barBeatAt(4.5, 120, 4)).toBe('bar 3, beat 2');
  });

  it('describes a stems export', () => {
    const project = { ...song(), notes: 'Capo 2' };
    project.sections[1]!.notes = 'Am F C G';
    const plan = planExport(
      project,
      options({ kind: 'stems', range: { kind: 'section', id: 's2' } }),
    )!;
    const text = infoText(project, plan, 48000, 'Chorus');
    expect(text).toContain('Tempo: 120 BPM');
    expect(text).toContain('Time signature: 4/4');
    expect(text).toContain('Sample rate: 48000 Hz');
    expect(text).toContain('Range: Chorus, 0:04.000 – 0:10.000 of the idea');
    expect(text).toContain('Every file starts at 0:04.000 (bar 3, beat 1)');
    expect(text).toContain('  01 Vocals.m4a');
    expect(text).toContain('  0:00.000  Chorus');
    expect(text).toContain('Am F C G');
    expect(text).not.toContain('Verse');
    expect(text).toContain('Notes:\nCapo 2');
  });
});
