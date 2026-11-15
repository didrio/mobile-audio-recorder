import { Platform } from 'react-native';
import type { AudioDeviceInfo, AudioDevicesInfo } from 'react-native-audio-api';

/**
 * Inputs and outputs (T38), as pure rules over what `AudioManager.getDevicesInfo()` reports. iOS
 * categories are AVAudioSession port types, Android ones the library's names
 * (`MediaSessionManager.kt` `parseDeviceCategory`). The live state is in `audio-route-store.ts`.
 */

/** Output routes that get their own latency offset: each has very different output latency. */
export const OUTPUT_ROUTES = ['speaker', 'wired', 'bluetooth', 'usb'] as const;
export type OutputRoute = (typeof OUTPUT_ROUTES)[number];

export const OUTPUT_ROUTE_LABELS: Record<OutputRoute, string> = {
  speaker: 'Speaker',
  wired: 'Wired headphones',
  bluetooth: 'Bluetooth',
  usb: 'USB audio',
};

const SPEAKER = new Set([
  // iOS
  'Speaker',
  'Receiver',
  // Android
  'Built-in Speaker',
  'Built-in Earpiece',
]);
const WIRED = new Set([
  // iOS
  'Headphones',
  'LineOut',
  'HDMI',
  // Android
  'Wired Headset',
  'Wired Headphones',
]);
/** Wireless outputs with Bluetooth-like latency: AirPlay and CarPlay are counted here too. */
const BLUETOOTH = new Set([
  'BluetoothA2DPOutput',
  'BluetoothHFP',
  'BluetoothLE',
  'AirPlay',
  'CarAudio',
]);
const USB = new Set(['USBAudio']);

/** The latency route of an output category. Unknown categories count as the speaker. */
export function outputRouteOf(category: string): OutputRoute {
  if (SPEAKER.has(category)) return 'speaker';
  if (WIRED.has(category)) return 'wired';
  if (BLUETOOTH.has(category) || category.startsWith('Bluetooth')) return 'bluetooth';
  if (USB.has(category) || category.startsWith('USB')) return 'usb';
  return 'speaker';
}

const ROUTE_PRIORITY: Record<OutputRoute, number> = { speaker: 0, bluetooth: 1, wired: 2, usb: 3 };

/**
 * The output the app plays to. iOS reports the current route. Android doesn't (`currentOutputs` is
 * always empty), so the connected output media would normally go to is assumed: USB, then wired,
 * then Bluetooth, then the built-in speaker (not the earpiece).
 */
export function currentOutput(
  info: Pick<AudioDevicesInfo, 'currentOutputs' | 'availableOutputs'>,
  os: typeof Platform.OS = Platform.OS,
): AudioDeviceInfo | null {
  if (os === 'ios') return info.currentOutputs[0] ?? null;
  let best: AudioDeviceInfo | null = null;
  let bestRank = -1;
  for (const device of info.availableOutputs) {
    const rank =
      ROUTE_PRIORITY[outputRouteOf(device.category)] * 2 +
      (device.category === 'Built-in Earpiece' ? 0 : 1);
    if (rank > bestRank) {
      best = device;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Outputs the user hears privately, so the mic can't pick up the app (speaker mode and silent
 * recording don't apply). A Bluetooth speaker looks like headphones on iOS (it can't be told apart),
 * so it records with the plain mic; AirPlay and car audio are speakers.
 */
const PRIVATE_OUTPUTS = new Set([
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
  'USB Device',
]);

/** Whether the app plays to headphones (or an interface), not out loud. */
export function headphonesConnected(
  info: Pick<AudioDevicesInfo, 'currentOutputs' | 'availableOutputs'>,
  os: typeof Platform.OS = Platform.OS,
): boolean {
  const output = currentOutput(info, os);
  return !!output && PRIVATE_OUTPUTS.has(output.category);
}

/**
 * Speaker mode (cleaning) and silent recording only apply without headphones: with them nothing leaks
 * into the mic.
 */
export function speakerModeApplies(speakerMode: boolean, headphones: boolean): boolean {
  return speakerMode && !headphones;
}

/** A remembered device: Android ids change when a device reconnects, so name and category count too. */
export type DeviceRef = Pick<AudioDeviceInfo, 'id' | 'name' | 'category'>;

/** Key for per-device settings (channel, gain) that survives Android's changing ids. */
export function deviceKey(device: Pick<AudioDeviceInfo, 'name' | 'category'>): string {
  return `${device.category}:${device.name}`;
}

/**
 * The connected device matching a remembered one: the same id, else the same name and category;
 * `null` when it's gone (the system default is used, and the choice comes back with the device).
 */
export function resolvePreferredInput(
  available: readonly AudioDeviceInfo[],
  preferred: DeviceRef | null,
): AudioDeviceInfo | null {
  if (!preferred) return null;
  return (
    available.find((device) => device.id === preferred.id) ??
    available.find((device) => deviceKey(device) === deviceKey(preferred)) ??
    null
  );
}

/**
 * The input being recorded from. iOS reports the current route's input. Android reports only a
 * device picked with `setInputDevice`; without one the system records from the built-in mic.
 */
export function currentInput(
  info: Pick<AudioDevicesInfo, 'currentInputs' | 'availableInputs'>,
  os: typeof Platform.OS = Platform.OS,
): AudioDeviceInfo | null {
  const current = info.currentInputs[0];
  if (current || os === 'ios') return current ?? null;
  return info.availableInputs.find((device) => device.category === 'Built-in Mic') ?? null;
}

/** Bluetooth headset mics (call quality; using one drops the headphones out of high-quality sound). */
export function isBluetoothInput(category: string): boolean {
  return category.startsWith('Bluetooth');
}

/**
 * The inputs offered in the picker: Bluetooth mics only when the user allows recording with them
 * ("Use the phone's mic with Bluetooth headphones" off).
 */
export function pickableInputs(
  available: readonly AudioDeviceInfo[],
  bluetoothPhoneMic: boolean,
): AudioDeviceInfo[] {
  return available.filter((device) => !bluetoothPhoneMic || !isBluetoothInput(device.category));
}

/** The input channel to record (0-based), or the first when the input has fewer channels. */
export function inputChannel(channel: number | undefined, channelCount: number): number {
  return channel !== undefined && channel >= 0 && channel < channelCount ? channel : 0;
}

const BUILT_IN_MICS = new Set(['MicrophoneBuiltIn', 'Built-in Mic']);

/**
 * How an input is named: its own name ("iPhone Microphone", "Scarlett 2i2"), except a built-in mic
 * without a real one (Android reports the phone model; the simulator the port type).
 */
export function inputName(device: Pick<AudioDeviceInfo, 'name' | 'category'>): string {
  if (
    BUILT_IN_MICS.has(device.category) &&
    (device.category === 'Built-in Mic' || !device.name || device.name === device.category)
  ) {
    return 'Built-in Microphone';
  }
  return device.name;
}

/** "Scarlett 2i2", or "Scarlett 2i2 · Input 2" for an input with several channels. */
export function inputLabel(name: string, channel: number, channelCount: number): string {
  return channelCount > 1 ? `${name} · Input ${channel + 1}` : name;
}

/** How an output is named in Settings: built-in outputs by role, others by their own name. */
export function outputLabel(device: AudioDeviceInfo | null): string {
  if (!device) return 'Speaker';
  if (device.category === 'Speaker' || device.category === 'Built-in Speaker') return 'Speaker';
  if (device.category === 'Receiver' || device.category === 'Built-in Earpiece') return 'Earpiece';
  return device.name || OUTPUT_ROUTE_LABELS[outputRouteOf(device.category)];
}
