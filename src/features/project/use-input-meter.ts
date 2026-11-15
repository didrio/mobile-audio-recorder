import { useEffect, useEffectEvent, useState } from 'react';
import { AppState } from 'react-native';

import { peakLevel, setMetering } from '@/features/audio/audio-engine';
import { currentInputSelection, useAudioRouteStore } from '@/features/audio/audio-route-store';
import { useClipHold } from '@/features/audio/clip-hold';
import { useInputDevicesStore } from '@/features/settings/input-devices-store';

/** Whether the app is in the foreground (the mic is released in the background). */
export function useForeground(): boolean {
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state !== 'background'),
    );
    return () => subscription.remove();
  }, []);
  return foreground;
}

/**
 * The live mic level (0–1) while `enabled`, and 0 otherwise, and whether it just clipped. The mic is
 * open only while `enabled` and the app isn't in the background (the caller says when a track is armed, the idea is on screen
 * and nothing is recording: idle or playing, T39); every other case releases it, so the system's mic indicator
 * is only on while a track is armed.
 */
export function useInputMeter(enabled: boolean): { level: number; clipped: boolean } {
  const [level, setLevel] = useState(0);
  const clip = useClipHold();
  const foreground = useForeground();
  const on = enabled && foreground;
  // Reopens the mic when the input or its channel changes (the meter follows the chosen channel).
  const route = useAudioRouteStore((state) => state);
  const channelByDevice = useInputDevicesStore((state) => state.channelByDevice);
  const { channels, channel } = currentInputSelection(route, channelByDevice);
  const onBuffer = useEffectEvent((samples: Float32Array) => {
    const peak = peakLevel(samples);
    setLevel(peak);
    clip.report(peak);
  });
  useEffect(() => {
    if (!on) return;
    void setMetering((samples) => onBuffer(samples), { channels, channel });
    return () => {
      void setMetering(null);
      setLevel(0);
    };
  }, [on, channels, channel]);

  return { level: on ? level : 0, clipped: on && clip.clipped };
}
