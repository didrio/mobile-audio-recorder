import { interruptionAction } from './interruption';

describe('interruptionAction', () => {
  it('stops and saves a recording, saying why', () => {
    const action = interruptionAction('recording', 'interruption');
    expect(action.kind).toBe('stopRecording');
    expect(action.kind === 'stopRecording' && action.message).toMatch(/saved/);
  });

  it('notes a stop from the notification differently', () => {
    const action = interruptionAction('recording', 'notificationStop');
    expect(action.kind === 'stopRecording' && action.message).toMatch(/notification/);
  });

  it('pauses playback', () => {
    expect(interruptionAction('playing', 'interruption')).toEqual({ kind: 'pausePlayback' });
  });

  it('ignores it while idle, starting or stopping', () => {
    for (const status of ['idle', 'starting', 'stopping'] as const) {
      expect(interruptionAction(status, 'interruption')).toEqual({ kind: 'none' });
    }
  });
});
