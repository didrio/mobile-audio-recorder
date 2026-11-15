import {
  LATENCY_OFFSET_MAX_MS,
  LATENCY_OFFSET_MIN_MS,
  latencyOffsetFor,
  migrateRecordingSettings,
  useRecordingSettingsStore,
} from './recording-settings-store';

const NO_OFFSETS = { speaker: 0, wired: 0, bluetooth: 0, usb: 0 };

describe('recording settings', () => {
  beforeEach(() => {
    useRecordingSettingsStore.setState({
      latencyOffsetsMs: NO_OFFSETS,
      legacyLatencyOffsetMs: null,
    });
  });

  it('keeps speaker mode off, the cleanup light, the phone mic with Bluetooth and 24-bit by default', () => {
    const state = useRecordingSettingsStore.getState();
    expect(state.speakerMode).toBe(false);
    expect(state.cleanupStrength).toBe('light');
    expect(state.bluetoothPhoneMic).toBe(true);
    expect(state.bitDepth).toBe(24);
  });

  it('keeps one latency offset per output route, clamped and rounded', () => {
    const { setLatencyOffsetMs } = useRecordingSettingsStore.getState();
    setLatencyOffsetMs('bluetooth', 10_000);
    setLatencyOffsetMs('speaker', -10_000);
    setLatencyOffsetMs('wired', 42.4);
    const state = useRecordingSettingsStore.getState();
    expect(latencyOffsetFor(state, 'bluetooth')).toBe(LATENCY_OFFSET_MAX_MS);
    expect(latencyOffsetFor(state, 'speaker')).toBe(LATENCY_OFFSET_MIN_MS);
    expect(latencyOffsetFor(state, 'wired')).toBe(42);
    expect(latencyOffsetFor(state, 'usb')).toBe(0);
  });

  it('gives the pre-route offset to the first route seen, once', () => {
    useRecordingSettingsStore.setState({ legacyLatencyOffsetMs: 35 });
    const { claimLegacyOffset } = useRecordingSettingsStore.getState();
    claimLegacyOffset('wired');
    claimLegacyOffset('bluetooth');
    const state = useRecordingSettingsStore.getState();
    expect(state.latencyOffsetsMs).toEqual({ ...NO_OFFSETS, wired: 35 });
    expect(state.legacyLatencyOffsetMs).toBeNull();
  });
});

describe('migrateRecordingSettings', () => {
  it('turns the single v1 offset into per-route offsets, holding the old value for the current route', () => {
    expect(
      migrateRecordingSettings({ latencyOffsetMs: 40, speakerMode: false, preRollSeconds: 4 }, 1),
    ).toEqual({
      speakerMode: false,
      preRollSeconds: 4,
      latencyOffsetsMs: NO_OFFSETS,
      legacyLatencyOffsetMs: 40,
    });
  });

  it('has nothing to hold when the old offset was 0 or missing', () => {
    expect(migrateRecordingSettings({ latencyOffsetMs: 0 }, 1)).toEqual({
      latencyOffsetsMs: NO_OFFSETS,
      legacyLatencyOffsetMs: null,
    });
    expect(migrateRecordingSettings({}, 0)).toEqual({
      latencyOffsetsMs: NO_OFFSETS,
      legacyLatencyOffsetMs: null,
    });
  });

  it('leaves v2 settings alone', () => {
    const v2 = { latencyOffsetsMs: { ...NO_OFFSETS, usb: 10 }, legacyLatencyOffsetMs: null };
    expect(migrateRecordingSettings(v2, 2)).toBe(v2);
  });
});
