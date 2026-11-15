import { pickRecordingResult } from './recording-result';

const file = { paths: ['/cache/take.wav'], size: 1.2, duration: 12.5 };

describe('pickRecordingResult', () => {
  it('uses what stop() returned', () => {
    const stashed = { paths: ['/cache/other.wav'], size: 1, duration: 1 };
    expect(pickRecordingResult({ status: 'success', ...file }, stashed)).toEqual({
      ok: true,
      file,
    });
  });

  it('falls back to the stashed file when the system already stopped the recording', () => {
    expect(
      pickRecordingResult(
        { status: 'error', message: 'Recorder is not in recording state.' },
        file,
      ),
    ).toEqual({ ok: true, file });
  });

  it('reports the error when nothing was stashed', () => {
    expect(pickRecordingResult({ status: 'error', message: 'boom' }, null)).toEqual({
      ok: false,
      message: 'boom',
    });
    expect(
      pickRecordingResult(
        { status: 'error', message: 'boom' },
        { paths: [], size: 0, duration: 0 },
      ),
    ).toEqual({ ok: false, message: 'boom' });
  });
});
