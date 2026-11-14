import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AudioManager, type AudioDevicesInfo } from 'react-native-audio-api';

/**
 * Output categories that mean the user hears the app privately, so the mic can't pick it up and
 * speaker mode isn't needed. iOS reports AVAudioSession port types, Android the library's names
 * (`MediaSessionManager.kt`). A Bluetooth speaker looks like headphones here (it can't be told
 * apart on iOS), so it records with the plain mic.
 */
const HEADPHONE_CATEGORIES = new Set([
  // iOS
  'Headphones',
  'BluetoothA2DPOutput',
  'BluetoothHFP',
  'BluetoothLE',
  'USBAudio',
  // Android
  'Wired Headset',
  'Wired Headphones',
  'Bluetooth A2DP',
  'Bluetooth SCO',
  'Bluetooth LE Headset',
  'USB Headset',
]);

/**
 * Whether headphones are connected. iOS reports the outputs of the current route; Android doesn't
 * (`currentOutputs` is always empty), so any connected headphones count there.
 */
export function headphonesConnected(
  info: Pick<AudioDevicesInfo, 'currentOutputs' | 'availableOutputs'>,
  os: typeof Platform.OS = Platform.OS,
): boolean {
  const outputs = os === 'ios' ? info.currentOutputs : info.availableOutputs;
  return outputs.some((device) => HEADPHONE_CATEGORIES.has(device.category));
}

/**
 * Speaker mode (cleaning) and silent recording only apply without headphones: with them nothing leaks
 * into the mic.
 */
export function speakerModeApplies(speakerMode: boolean, headphones: boolean): boolean {
  return speakerMode && !headphones;
}

/** Whether headphones are connected, re-checked whenever the audio route changes. */
export function useHeadphones(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => {
      AudioManager.getDevicesInfo()
        .then((info) => {
          if (active) setConnected(headphonesConnected(info));
        })
        .catch(() => {});
    };
    check();
    const subscription = AudioManager.addSystemEventListener('routeChange', check);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return connected;
}
