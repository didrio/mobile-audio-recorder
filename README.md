# Audio Recorder

A quick, unrestrictive recorder for musicians: capture a 2–3 minute song idea with several tracks, then
trim, split and move clips on a simple horizontal timeline (time runs left to right, tracks are rows). Portrait
only. A sketchpad, not a DAW: no software instruments. Everything stays on the device.

**Needs a development build** (`npm run ios` / `npm run android`): the audio engine
(`react-native-audio-api`) isn't part of Expo Go, so `npm run start:go` can't record or play.

Created from the base template; `npm run sync-base` pulls in later base improvements (see
[docs/new-app-checklist.md](docs/new-app-checklist.md)).

**Stack:** Expo SDK 58 · React Native 0.88 (New Architecture) · React 19.3 + React Compiler · TypeScript ·
Expo Router with native tabs · TanStack Query · zustand · zod · Jest + Testing Library · Maestro · EAS Build /
Submit / Update.

## Quick start

```bash
npm install
npm run doctor        # what this Mac can run (Expo Go, simulators, devices, cloud builds)
npm run start:go      # then scan the QR code with the Expo Go app on your phone
```

With Xcode or the Android SDK installed: `npm run ios` / `npm run android`. Full guide, including real
devices and one-command toolchain setup (`bash scripts/setup-mac.sh`): [docs/getting-started.md](docs/getting-started.md).

## How work flows

Work is tracked in [TICKETS.md](TICKETS.md), an ordered, living backlog, and done one ticket per session:

1. `/clear`, then pick the model, effort and plan mode the ticket recommends.
2. `/start T5` (or just `/start` for a recommendation).
3. Work with the agent; `/ticket <idea>` captures anything for later.
4. `/wrap`: final checks, the backlog is updated for the next session, everything is committed, and you get the
   exact steps for the next session.

## Everyday commands

| Command                                         | What it does                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `npm start`                                     | Bundler for an installed development build                    |
| `npm run start:go`                              | Bundler for Expo Go (zero native setup)                       |
| `npm run ios` / `npm run android`               | Build + run the dev app on a simulator/emulator               |
| `npm run ios:device` / `npm run android:device` | Same, on a USB-connected phone                                |
| `npm run check`                                 | Typecheck, lint, format check, unit tests (what CI runs)      |
| `npm run e2e`                                   | Maestro end-to-end flows                                      |
| `npm run screenshot`                            | Save a screenshot of the running simulator/emulator           |
| `npm run build:preview`                         | Cloud build for testers (install via link)                    |
| `npm run release`                               | Production builds → TestFlight + Google Play internal testing |
| `npm run update:production -- -m "…"`           | Over-the-air JS update to store users                         |
| `npm run deploy`                                | Build+submit if native code changed, otherwise OTA update     |

## Docs

- [Getting started](docs/getting-started.md) — running on simulators, emulators and phones
- [Architecture](docs/architecture.md) — structure, styling, state, data fetching, testing
- [Native code](docs/native.md) — native libraries, permissions, config plugins, Swift/Kotlin modules
- [Releasing](docs/releasing.md) — testers, App Store, Google Play, OTA updates, automation
- [Decisions](docs/decisions.md) — why each piece of the stack was chosen
- [AGENTS.md](AGENTS.md) — the operating manual for AI coding agents (Claude Code reads it via CLAUDE.md)

Placeholder icon and splash images come from Expo's MIT-licensed project template; replace them per app.
