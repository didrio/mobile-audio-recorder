# echo-canceller (local Expo module)

Speaker mode (T21, un-shelved and made one setting in T47): removes what the speaker played (other tracks, the
metronome) from a take recorded without headphones, after Stop. Switched on in Settings → Experimental → Speaker
mode, off by default. The app side is `src/lib/echo-canceller.ts` (loads this module) and
`src/features/audio/echo-reference.ts` (builds the plan of what played, from the engine's `BackingPlayed`).

- `cpp/echo_cancel.{h,c}`: the algorithm, plain C so both platforms share it. Mixes the reference from the plan,
  finds the echo delay (GCC-PHAT), estimates the speaker → room → mic path once per take as fixed filters for
  the reference and two distorted copies of it (a Hammerstein model; iteratively reweighted so the performer
  doesn't bias it), subtracts the predicted echo, then turns down per frequency what's left of the backing and,
  by the amount measured where the performer is quiet, of the metronome clicks. Writes a 24-bit WAV. The
  header explains the options; `ec_default_options` holds the tuned (aggressive) values the app uses.
- `cpp/dr_wav.h`: WAV reading/writing, vendored unmodified from https://github.com/mackron/dr_libs (commit
  `f12e197`, public domain / MIT-0, licence at the end of the file).
- `ios/EchoCancellerModule.swift`: `cleanTake` (an `AsyncFunction`, runs off the JS thread). Only paths and the
  small plan cross the bridge; all audio stays native.
- `EchoCanceller.podspec`: at the module root so it can compile `cpp/` next to `ios/`; the C code is optimized
  in every configuration (`GCC_OPTIMIZATION_LEVEL` 3), development builds included.
- `android/`: `CMakeLists.txt` builds `cpp/echo_cancel.c` with `src/main/cpp/echo_canceller_jni.c` into
  `libecho_canceller.so` (`-O3` in every build type, 16 KB pages); `EchoCancellerModule.kt` exposes the same
  `cleanTake` (same request, result and error messages), flattening the plan into arrays for JNI.

## Testing the C core on a Mac

```bash
node modules/echo-canceller/cpp/tests/run.mjs
```

Builds `cpp/tests/ec_test.c` with the system compiler and checks, on synthetic backing + clicks + a "voice"
through three made-up phones, how much backing and click is removed, that the voice level holds and how much
the voice is altered (voice/residual), that the delay is found, and how long a 3-minute take takes. The phones:
**clean** (a fixed, nearly linear speaker and a short room), **clipping** (the same speaker driven hard) and
**realistic** (a limiter whose gain follows the music, a 450 ms room tail, a reflection that drifts as the
performer moves). Only the realistic one reproduces what was heard on an iPhone (the backing still audible with
the old Light / Strong). It prints where the WAV files are, to listen to them.

Tuning without editing code: `EC_QUICK=1` runs each phone once (no pass/fail), and `EC_FILTER_MS`, `EC_ITER`,
`EC_FRAME`, `EC_MARGIN`, `EC_PERCENTILE`, `EC_MAX_RATIO`, `EC_SPREAD`, `EC_BROADBAND`, `EC_FLOOR`,
`EC_CLICK_MARGIN`, `EC_CLICK_FLOOR` override one option each. `VOICE_WAV=path` (mono, 48 kHz) uses a real voice
instead of the sung sine, which is what to listen to for dullness. One way to make one:

```bash
say -o /tmp/voice.aiff "La la la, a little song idea" && afconvert -f WAVE -d LEF32@48000 -c 1 /tmp/voice.aiff /tmp/voice.wav
```

`EC_DIAG_NO_LIMITER`, `EC_DIAG_NO_DRIFT`, `EC_DIAG_NO_TAIL` take one effect out of the realistic phone.

## Tuning (T47, desktop)

Realistic phone, 60 s, echo 40 ms. "Removed" is where only the backing plays; voice/residual is how much the
voice itself is altered (higher is cleaner; ~35+ is untouched); a 60 s take cleans in ~3 s on an M-series Mac.

| Settings                                                               |     Backing |      Clicks |  Voice level | Voice/residual |
| ---------------------------------------------------------------------- | ----------: | ----------: | -----------: | -------------: |
| Old Light (85 ms, no residual suppression, clicks 2 / 0.1)             |     14.7 dB |     15.6 dB |      0.00 dB |        25.9 dB |
| Old Strong (85 ms, margin 0.1, floor 0.2, clicks 3 / 0.03)             |     22.2 dB |     22.4 dB |     −0.01 dB |        27.9 dB |
| Filter 300 ms only (250 and 400 the same; 8 iterations no better)      |     25.2 dB |     22.8 dB |     −0.02 dB |        28.9 dB |
| + margin 0.5, floor 0.05, broadband 0.05, clicks 5 / 0.01              |     35.8 dB |     33.1 dB |     −0.07 dB |        26.1 dB |
| + margin 1, floor 0.03                                                 |     39.9 dB |     37.0 dB |     −0.12 dB |        23.3 dB |
| **+ spread 1 (the default)**                                           | **44.3 dB** | **45.1 dB** | **−0.21 dB** |    **20.4 dB** |
| margin 2, floor 0.02, spread 1 (too far)                               |     45.8 dB |     53.2 dB |     −0.34 dB |        17.0 dB |
| Extreme (400 ms, 8 it., margin 1, floor .03, spread 3, clicks 5 / .01) |     45.1 dB |     50.1 dB |     −0.33 dB |        17.7 dB |

Findings: the longer filter and `broadband` (what a distorting speaker adds) are free; `spread` and a high
`margin` buy the most and cost voice quality. Of the realistic effects, the drifting reflection (the performer
moving) limits the linear cancellation most (~4 dB); the limiter and the long tail matter little, and a
per-block gain on the predicted echo (to follow the limiter) gained only ~1.5 dB, so it was left out. Measuring
the backing's leftover (as the clicks do, `percentile` 0.25) spares the voice on a good phone but only reaches
~23–27 dB on the realistic one; higher percentiles end up like the fixed share with worse numbers, so the backing
uses the fixed share (`percentile` 0, `max_ratio` 1). Cost: on the clean phone the voice is altered as much as
on the realistic one (voice/residual ~19 dB instead of 35+), since the suppression doesn't know how well the
filter fitted.

If cleaned takes sound dull or watery on a phone, pull back in this order: `residual.spread` 1 → 0,
`residual.margin` 1 → 0.5, `residual.floor` 0.03 → 0.1 (`ec_default_options` in `cpp/echo_cancel.c`).
