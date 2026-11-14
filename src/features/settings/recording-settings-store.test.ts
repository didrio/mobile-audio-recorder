import {
  LATENCY_OFFSET_MAX_MS,
  LATENCY_OFFSET_MIN_MS,
  useRecordingSettingsStore,
} from './recording-settings-store';

describe('recording settings', () => {
  it('keeps speaker mode off and the cleanup light by default', () => {
    expect(useRecordingSettingsStore.getState().speakerMode).toBe(false);
    expect(useRecordingSettingsStore.getState().cleanupStrength).toBe('light');
  });

  it('clamps and rounds the latency offset', () => {
    const { setLatencyOffsetMs } = useRecordingSettingsStore.getState();
    setLatencyOffsetMs(10_000);
    expect(useRecordingSettingsStore.getState().latencyOffsetMs).toBe(LATENCY_OFFSET_MAX_MS);
    setLatencyOffsetMs(-10_000);
    expect(useRecordingSettingsStore.getState().latencyOffsetMs).toBe(LATENCY_OFFSET_MIN_MS);
    setLatencyOffsetMs(42.4);
    expect(useRecordingSettingsStore.getState().latencyOffsetMs).toBe(42);
  });
});
