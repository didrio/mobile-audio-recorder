import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { act } from 'react';

import { testClip, testProject, testSection, testTrack } from '@/features/project/edit-test-data';
import { useEditorStore } from '@/features/project/editor-store';
import type { Project } from '@/features/projects/projects-repo';

import { DEFAULT_EXPORT_SETTINGS, useExportSettingsStore } from './export-settings-store';
import { ExportSheet } from './export-sheet';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'p1' }) }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
jest.mock('@/features/projects/projects-repo', () => ({ getProject: jest.fn() }));
jest.mock('./export-runner', () => {
  class ExportCancelled extends Error {}
  return {
    ExportCancelled,
    exportIdea: jest.fn(() => Promise.resolve({ files: [], folder: {} })),
    measurePeak: jest.fn(() => Promise.resolve(0.5)),
    share: jest.fn(() => Promise.resolve()),
    cleanUp: jest.fn(),
  };
});

const runner = jest.requireMock<typeof import('./export-runner')>('./export-runner');

function song(): Project {
  const vocals = { ...testTrack('t1', 0, [testClip('c1', 't1', 0, 10)]), name: 'Vocals' };
  const bass = { ...testTrack('t2', 1, [testClip('c2', 't2', 2, 6)]), name: 'Bass' };
  return {
    ...testProject([vocals, bass], [testSection('s1', 'Chorus', 4, 6)]),
    name: 'Night drive',
    takes: {
      take1: {
        id: 'take1',
        projectId: 'p1',
        path: 'projects/p1/takes/take1.wav',
        duration: 20,
        sampleRate: 48000,
        channels: 1,
        createdAt: 0,
      },
    },
  };
}

async function openSheet(project = song()) {
  act(() => {
    useEditorStore.setState({ projectId: 'p1', project, loopRegion: null });
  });
  await render(<ExportSheet />);
}

describe('ExportSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExportSettingsStore.setState(DEFAULT_EXPORT_SETTINGS);
  });

  it('exports and shares the whole mix as M4A by default', async () => {
    const user = userEvent.setup();
    await openSheet();

    expect(screen.getByRole('radio', { name: 'Whole idea, 0:10.0' })).toBeSelected();
    expect(screen.getByRole('radio', { name: /^Chorus/ })).toBeOnTheScreen();
    expect(screen.getByText('Night drive.m4a')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(runner.share).toHaveBeenCalled());
    expect(runner.exportIdea).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      expect.objectContaining({
        kind: 'mix',
        range: { kind: 'whole' },
        format: 'm4a',
        normalize: true,
        includeClick: false,
      }),
      expect.anything(),
    );
    expect(runner.cleanUp).toHaveBeenCalled();
  });

  it('exports stems of a section as one zip with the extras', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.press(screen.getByRole('radio', { name: 'Stems' }));
    await user.press(screen.getByRole('radio', { name: /^Chorus/ }));
    expect(screen.getByRole('switch', { name: 'Tempo & markers (MIDI)' })).toBeOnTheScreen();
    // Two stems, the MIDI tempo map (on by default) and info.txt.
    expect(screen.getByText('Night drive – stems.zip · 4 files')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(runner.exportIdea).toHaveBeenCalled());
    expect(jest.mocked(runner.exportIdea).mock.calls[0]![1]).toMatchObject({
      kind: 'stems',
      range: { kind: 'section', id: 's1' },
      midi: true,
      delivery: 'zip',
    });
    expect(useExportSettingsStore.getState().kind).toBe('stems');
  });

  it('warns when the mix would clip with Normalize off', async () => {
    jest.mocked(runner.measurePeak).mockResolvedValue(1.5);
    await openSheet();

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    await fireEvent(screen.getByRole('switch', { name: 'Normalize' }), 'valueChange', false);
    expect(useExportSettingsStore.getState().normalize).toBe(false);
    await waitFor(() => expect(runner.measurePeak).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /The mix would clip \(peaks at \+3\.5 dB\)/,
    );
  });

  it('can’t export a range without audio', async () => {
    const project = song();
    project.sections = [testSection('s9', 'Outro', 30, 4)];
    const user = userEvent.setup();
    await openSheet(project);

    await user.press(screen.getByRole('radio', { name: /^Outro/ }));
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByText('There’s no audio to export in this range.')).toBeOnTheScreen();
  });
});
