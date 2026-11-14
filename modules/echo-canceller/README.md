# echo-canceller (local Expo module)

Speaker mode (T21): removes what the speaker played (other tracks, the metronome) from a take recorded without
headphones, after Stop. The app side is `src/lib/echo-canceller.ts` (loads this module, absent on Android for
now) and `src/features/audio/echo-reference.ts` (builds the plan of what played, from the engine's
`BackingPlayed`).

- `cpp/echo_cancel.{h,c}`: the algorithm, plain C so both platforms share it. Mixes the reference from the plan,
  finds the echo delay (GCC-PHAT), estimates the speaker → room → mic path once per take as fixed filters for
  the reference and two distorted copies of it (a Hammerstein model; iteratively reweighted so the performer
  doesn't bias it), subtracts the predicted echo, then suppresses what's left of the metronome clicks by the
  amount measured where the performer is quiet. Writes a 24-bit WAV. The header explains the options.
- `cpp/dr_wav.h`: WAV reading/writing, vendored unmodified from https://github.com/mackron/dr_libs (commit
  `f12e197`, public domain / MIT-0, licence at the end of the file).
- `ios/EchoCancellerModule.swift`: `cleanTake` (an `AsyncFunction`, runs off the JS thread). Only paths and the
  small plan cross the bridge; all audio stays native.
- `EchoCanceller.podspec`: at the module root so it can compile `cpp/` next to `ios/`; the C code is optimized
  in every configuration (`GCC_OPTIMIZATION_LEVEL` 3), development builds included.
- Android (T32): add a CMake build of `cpp/echo_cancel.c`, a JNI function and a Kotlin module with the same
  `cleanTake`, and list `android` in `expo-module.config.json`.

## Testing the C core on a Mac

```bash
node modules/echo-canceller/cpp/tests/run.mjs
```

Builds `cpp/tests/ec_test.c` with the system compiler and checks, on synthetic backing + clicks + a "voice"
through a made-up phone speaker and room (also a clipping one): how much backing and click is removed (also
while the voice sings), that the voice is untouched, that the delay is found, and how long a 3-minute take
takes. It prints where the WAV files are, to listen to them.
