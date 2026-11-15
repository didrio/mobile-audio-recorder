/**
 * Hear yourself (T39): when input monitoring may run and what the user is told about it. Pure; the
 * audio side is `setMonitor` in `audio-engine.ts`, the wiring `use-monitoring.ts` in the project.
 *
 * Monitoring is offered only where the user hears the app privately (headphones, an interface), never
 * on the speaker (it would feed back into the mic), and only while the round trip (mic → app →
 * headphones) is short enough to play along to. Bluetooth headphones never are (A2DP alone adds
 * 100–250 ms), so they're refused even before a number is known.
 */
import type { RouteLatency } from '@/lib/audio-input';

import { OUTPUT_ROUTE_LABELS, type OutputRoute } from './audio-route';

/** Longest delay still offered: beyond about this, hearing yourself turns into an echo. */
export const MAX_MONITOR_LATENCY_S = 0.03;

/** The audio library's IO buffer (frames) with its default `interactive` latency hint. */
const IO_BUFFER_FRAMES = 128;

/**
 * The expected round trip from what the system reports for the route: its input and output latency,
 * plus an IO buffer each way and one more for the hop from the recorder into the playback graph.
 * `null` when the platform doesn't report it (Android): the live measurement decides there.
 */
export function estimateMonitorLatency(latency: RouteLatency | null): number | null {
  if (!latency || latency.sampleRate <= 0) return null;
  return latency.input + latency.output + (3 * IO_BUFFER_FRAMES) / latency.sampleRate;
}

/**
 * - `speaker`: no headphones, not offered.
 * - `too-slow`: the delay is too long to play along to, not offered.
 * - `off` / `on`: offered; the user's switch.
 */
export type MonitorStatus = 'speaker' | 'too-slow' | 'off' | 'on';

export function monitorStatus(options: {
  /** The user's "Hear yourself" switch. */
  enabled: boolean;
  /** Whether the app plays to headphones or an interface (`headphonesConnected`). */
  headphones: boolean;
  route: OutputRoute;
  /** Measured or estimated round trip in seconds; `null` when not known yet. */
  latency: number | null;
}): MonitorStatus {
  const { enabled, headphones, route, latency } = options;
  if (!headphones) return 'speaker';
  const tooSlow = latency === null ? route === 'bluetooth' : latency > MAX_MONITOR_LATENCY_S;
  if (tooSlow) return 'too-slow';
  return enabled ? 'on' : 'off';
}

function milliseconds(seconds: number): string {
  return `~${Math.max(1, Math.round(seconds * 1000))} ms`;
}

/** The footnote under the switch: why it isn't offered, or the delay (and the direct-monitoring hint). */
export function monitorNote(
  status: MonitorStatus,
  route: OutputRoute,
  latency: number | null,
): string {
  if (status === 'speaker') {
    return "Needs headphones or an audio interface, so the speaker doesn't feed back into the mic.";
  }
  if (status === 'too-slow') {
    const where = route === 'bluetooth' ? ' on Bluetooth' : '';
    const amount = latency === null ? '' : ` (${milliseconds(latency)})`;
    return `Too much delay to play along to${where}${amount}. Use wired headphones, or your interface's direct monitoring.`;
  }
  const delay =
    latency === null
      ? 'The delay is measured once you hear yourself.'
      : `Delay ${milliseconds(latency)} (${OUTPUT_ROUTE_LABELS[route]}).`;
  return route === 'usb'
    ? `${delay} Your interface does its own direct monitoring? Leave this off, or you'll hear yourself twice.`
    : delay;
}
