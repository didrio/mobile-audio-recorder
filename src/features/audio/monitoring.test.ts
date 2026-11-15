import {
  estimateMonitorLatency,
  MAX_MONITOR_LATENCY_S,
  monitorNote,
  monitorStatus,
} from './monitoring';

describe('estimateMonitorLatency', () => {
  it('adds the route latencies, two IO buffers and the hop into the graph', () => {
    // 3 × 128 frames at 48 kHz = 8 ms.
    expect(estimateMonitorLatency({ input: 0.001, output: 0.002, sampleRate: 48_000 })).toBeCloseTo(
      0.011,
    );
  });

  it('is unknown where the platform reports nothing', () => {
    expect(estimateMonitorLatency(null)).toBeNull();
    expect(estimateMonitorLatency({ input: 0, output: 0, sampleRate: 0 })).toBeNull();
  });
});

describe('monitorStatus', () => {
  const base = { enabled: true, headphones: true, route: 'wired' as const, latency: 0.01 };

  it('is never offered on the speaker', () => {
    expect(monitorStatus({ ...base, headphones: false, route: 'speaker' })).toBe('speaker');
  });

  it('follows the switch on headphones with a short delay', () => {
    expect(monitorStatus(base)).toBe('on');
    expect(monitorStatus({ ...base, enabled: false })).toBe('off');
  });

  it('refuses a delay too long to play along to', () => {
    expect(monitorStatus({ ...base, latency: MAX_MONITOR_LATENCY_S + 0.001 })).toBe('too-slow');
    expect(monitorStatus({ ...base, latency: MAX_MONITOR_LATENCY_S })).toBe('on');
  });

  it('refuses Bluetooth before any number is known, and trusts a number when there is one', () => {
    expect(monitorStatus({ ...base, route: 'bluetooth', latency: null })).toBe('too-slow');
    expect(monitorStatus({ ...base, route: 'bluetooth', latency: 0.18 })).toBe('too-slow');
    expect(monitorStatus({ ...base, route: 'wired', latency: null })).toBe('on');
    expect(monitorStatus({ ...base, route: 'usb', latency: null })).toBe('on');
  });
});

describe('monitorNote', () => {
  it('explains why it is not offered', () => {
    expect(monitorNote('speaker', 'speaker', null)).toMatch(/Needs headphones/);
    expect(monitorNote('too-slow', 'bluetooth', 0.183)).toBe(
      "Too much delay to play along to on Bluetooth (~183 ms). Use wired headphones, or your interface's direct monitoring.",
    );
    expect(monitorNote('too-slow', 'bluetooth', null)).toMatch(
      /^Too much delay to play along to on Bluetooth\./,
    );
  });

  it('shows the delay, and the direct-monitoring hint for an interface', () => {
    expect(monitorNote('on', 'wired', 0.0094)).toBe('Delay ~9 ms (Wired headphones).');
    expect(monitorNote('off', 'wired', null)).toBe('The delay is measured once you hear yourself.');
    expect(monitorNote('on', 'usb', 0.006)).toBe(
      "Delay ~6 ms (USB audio). Your interface does its own direct monitoring? Leave this off, or you'll hear yourself twice.",
    );
  });
});
