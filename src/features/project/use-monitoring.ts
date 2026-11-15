import { useEffect, useEffectEvent } from 'react';

import { liveMonitorLatency, setMonitor, setMonitorLevel } from '@/features/audio/audio-engine';
import {
  currentInputSelection,
  currentOutputKey,
  useAudioRouteStore,
  useMonitorStatus,
} from '@/features/audio/audio-route-store';
import { useInputDevicesStore } from '@/features/settings/input-devices-store';
import { useRecordingSettingsStore } from '@/features/settings/recording-settings-store';

import { useForeground } from './use-input-meter';

/** How often the live round trip is read after monitoring starts, until the platform reports it. */
const MEASURE_INTERVAL_MS = 1000;
const MEASURE_ATTEMPTS = 5;

/**
 * Hear yourself (T39) in the editor: while `micOpen` (a track is armed and the idea is on screen,
 * whether idle, playing or recording) and Settings allow it (`useMonitorStatus`: switched on,
 * headphones, delay short enough), the chosen input plays in the headphones at the set level. It
 * follows the input and channel chosen in Settings, stops at once when the route changes to the
 * speaker, and measures the real round trip once running: a measurement that's too slow switches it
 * off for that output.
 */
export function useMonitoring(micOpen: boolean): void {
  const { status } = useMonitorStatus();
  const level = useRecordingSettingsStore((state) => state.monitorLevel);
  const foreground = useForeground();
  const route = useAudioRouteStore((state) => state);
  const channelByDevice = useInputDevicesStore((state) => state.channelByDevice);
  const { channels, channel } = currentInputSelection(route, channelByDevice);
  const outputKey = currentOutputKey(route);

  const on = status === 'on' && micOpen && foreground;
  const currentLevel = useEffectEvent(() => level);

  useEffect(() => {
    if (!on) return;
    setMonitor({ level: currentLevel(), input: { channels, channel } });
    return () => setMonitor(null);
  }, [on, channels, channel]);

  useEffect(() => {
    if (on) setMonitorLevel(level);
  }, [on, level]);

  useEffect(() => {
    if (!on || !outputKey) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const seconds = liveMonitorLatency();
      if (seconds !== null) {
        useAudioRouteStore.setState({ measuredMonitorLatency: { output: outputKey, seconds } });
      }
      if (seconds !== null || attempts >= MEASURE_ATTEMPTS) clearInterval(timer);
    }, MEASURE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [on, outputKey]);
}
