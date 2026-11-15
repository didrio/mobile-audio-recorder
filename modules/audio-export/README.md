# audio-export (local Expo module)

Export (T36, T37). The app renders mixes and stems itself (`src/features/audio/offline-render.ts`) and writes
WAV in JS (`src/features/audio/wav.ts`); this module does the two things JS and the installed libraries can't.
The app side is `src/lib/audio-export.ts`.

- `encodeM4A(wavPath, outputPath, bitRate)`: reads a 16/24-bit PCM WAV and writes AAC-LC in an MPEG-4
  container (`.m4a`). iOS: `AVAudioFile` (the type comes from the extension; retries without a bit rate if the
  encoder rejects it). Android: `MediaCodec` + `MediaMuxer` (24-bit input keeps the top 16 bits).
- `shareFiles(paths)`: one share sheet for several files (stems as separate files). iOS:
  `UIActivityViewController`, resolves when it closes. Android: `ACTION_SEND_MULTIPLE` through expo-sharing's
  FileProvider (`<package>.SharingFileProvider`, which covers the cache directory), resolves when the chooser
  returns. A single file is shared with expo-sharing instead.

Both are `AsyncFunction`s: only paths cross the bridge. Needs a development build (not in Expo Go).
