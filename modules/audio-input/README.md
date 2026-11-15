# audio-input (local Expo module)

Inputs and outputs (T38). The audio library (`react-native-audio-api`) lists and selects devices; this module
adds what it doesn't expose. The app side is `src/lib/audio-input.ts` and
`src/features/audio/route-picker-button.tsx`.

- `getInputInfo(deviceId)`: the current input's channel count, whether its gain is settable, and the gain; on iOS
  also the route's `inputLatency`, `outputLatency` and `sampleRate` (T39: the Hear yourself delay).
  iOS: `AVAudioSession` (`setPreferredInputNumberOfChannels(maximum)` first, so a two-input interface delivers
  both channels), `isInputGainSettable`, `inputGain`. Android: `AudioDeviceInfo.channelCounts` of the device
  with that id (the library's ids), or the built-in mic; gain is never settable.
- `setInputGain(gain)`: iOS `setInputGain` when settable; false otherwise (always on Android).
- `extractChannel(sourcePath, outputPath, channel)`: one channel of a multi-channel take as a mono WAV, same
  rate and sample format. The recorder averages channels when asked for mono, so the app records every channel
  of the input and keeps the chosen one. iOS: `AVAudioFile`. Android: walks the RIFF chunks and copies one
  channel's samples (PCM or float, 16/24/32-bit).
- `RoutePickerView` (iOS only): `AVRoutePickerView`, the system's output route button (`tintColor`,
  `activeTintColor`). Android leaves switching outputs to the system.

Only paths and small values cross the bridge. Needs a development build (not in Expo Go).
