import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { peakLevel, setMetering } from '@/features/audio/audio-engine';

/**
 * The live mic level (0–1) while `enabled`, and 0 otherwise. The mic is open only while `enabled`
 * and the app isn't in the background (the caller says when a track is armed, the idea is on screen
 * and nothing is playing or recording); every other case releases it, so the system's mic indicator
 * is only on while a track is armed.
 */
export function useInputMeter(enabled: boolean): number {
  const [level, setLevel] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state !== 'background'),
    );
    return () => subscription.remove();
  }, []);

  const on = enabled && foreground;
  useEffect(() => {
    if (!on) return;
    void setMetering((samples) => setLevel(peakLevel(samples)));
    return () => {
      void setMetering(null);
      setLevel(0);
    };
  }, [on]);

  return on ? level : 0;
}
