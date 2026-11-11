# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T2 — Timeline view (Skia, both orientations) · Opus · high effort · plan mode on

## In progress

_None._

## Up next

Product in one line: a quick multitrack sketchpad for musicians (2–3 min song ideas), with a simple timeline that
works in portrait (time runs top→bottom, tracks are columns) and landscape (time left→right, tracks are rows).
Not a DAW: no software instruments. Local only. Architecture and data model: `docs/decisions.md` (Audio engine,
Project data, Drawing) and the header comments of `src/lib/db.ts` and `src/features/audio/audio-engine.ts`.

### T2 — Timeline view (Skia, both orientations)

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Replace the take list in the project screen with a real timeline: track lanes, clips drawn with
  waveforms, a moving playhead, scroll and zoom, in both orientations.
- **Done when:**
  - [ ] `npx expo install @shopify/react-native-skia`; dev build rebuilt (`npm run native:clean` + `npm run ios`).
  - [ ] Orientation-aware layout from `useWindowDimensions()`: landscape = time on x, tracks stacked as rows;
        portrait = time on y (downwards), tracks side by side as columns. One "time axis ↔ cross axis" mapping
        so drawing/gesture code is written once, not twice.
  - [ ] Waveform peaks computed once per take and cached next to it (`<takeId>.peaks`, e.g. Float32 min/max per
        N samples) — decode via the engine, never on every render. Clips draw only their window
        (`offset`…`offset+duration`) of the take.
  - [ ] Playhead driven by the engine's `playbackPosition()` on the UI thread (Reanimated
        `useFrameCallback`/shared value), not React state ticks; auto-follows during playback.
  - [ ] Scroll along the time axis, pinch to zoom (seconds per point), tap the ruler to seek; Play starts from
        the playhead (`play(clips, { from })` already supports it).
  - [ ] Transport bar stays reachable in both orientations; screenshots of both orientations, light + dark.
- **Context:** Current editor: `src/features/project/project-screen.tsx` + `use-transport.ts` (status, clock,
  record/play; T1 records onto track 1 and appends takes). Data: `useProject(id)` → `Project` with `tracks[].clips`
  and `takes` (`src/features/projects/projects-repo.ts`). Engine: `src/features/audio/audio-engine.ts` (decoded
  buffers cached by take path; `AudioBuffer.getChannelData(0)` gives Float32 samples). Expo skill
  `expo:expo-animation` covers Reanimated/gesture patterns. Keep `makeStyles`/tokens for colors (Skia needs hex
  strings: read them from `useTheme().colors`). Simulator rotation: Device → Rotate (⌘←/⌘→) before
  `npm run screenshot`. Xcode 27's simulator window is DeviceHub: `open "devices://device/open?id=<udid>"`.
  T1 left unverified: landscape layout, Android emulator run, Maestro smoke (see Backlog) — cover them here.

### T3 — Multitrack overdub

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Record new tracks while hearing the existing ones, lined up in time.
- **Done when:**
  - [ ] Add / rename / delete tracks (repo functions + UI on the timeline); one track is **armed** for recording.
  - [ ] Record starts playback of the other tracks from the playhead and records onto the armed track at the
        playhead position (not appended like T1).
  - [ ] Latency compensation: the new clip's `start` is shifted by input + output latency
        (`AudioRecorder.inputLatency`, `AudioContext.outputLatency`) plus a manual offset in Settings
        (persist in `@/lib/storage`). Verify by recording a click/clap against an existing track.
  - [ ] Live waveform of the take being recorded (from the `onAudioReady` buffers the engine already receives).
  - [ ] Tests for the new repo functions' callers and the transport states; Maestro flow if practical.
- **Context:** Engine: recording and playback share one session (`playAndRecord`, `defaultToSpeaker`) in
  `audio-engine.ts`; headphones are recommended for overdubs (speaker bleed) — say so in the UI. Echo
  cancellation (`iosVoiceProcessing` / `voiceCommunication`) is deliberately **off**: it degrades music.
  Recording/playback start must be scheduled on the same `AudioContext` clock; check whether the recorder can be
  started at a context time or measure the start offset.

### T4 — First preview build

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** The app's own EAS project, preview builds installed on the user's devices, an OTA update received.
- **Done when:**
  - [ ] `npx eas-cli@latest init` + `update:configure` committed (revert its `eas.json` rewrite).
  - [ ] Android and iOS preview builds installed.
  - [ ] An `update:preview` published after both builds finished shows up after two cold starts (Settings →
        Update shows an update ID).
  - [ ] Surprises added to `docs/releasing.md`.
- **Context:** Follow "First preview build (once per app)" in `docs/releasing.md`. The user must be present for
  the iOS build (Apple login). Devices registered and the distribution certificate created for an earlier app
  are reused; only the App ID and provisioning profile are new. First real-device test of recording: check the
  mic permission prompt, speaker vs. earpiece routing, and Bluetooth headphones.

### T5 — Clip editing

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Edit clips on the timeline: select, move, trim, split, delete, with undo.
- **Done when:**
  - [ ] Tap selects a clip; drag moves it along time and between tracks; edge handles trim (changing `offset`
        and `duration`, never the file); split at the playhead creates two clips on the same take; delete.
  - [ ] Editor state for the open project lives in a zustand store (load from `getProject`, write through to
        SQLite on gesture end) with undo/redo.
  - [ ] Snap to other clip edges and the playhead (grid snapping comes with T9).
  - [ ] Orphaned takes (no clips left) are kept until the project is deleted (simple, safe for undo).
  - [ ] Unit tests for the pure edit operations (move/trim/split math).
- **Context:** Data model is already non-destructive (`clips.start/offset/duration`, `src/lib/db.ts`). Gestures:
  react-native-gesture-handler 3 + Reanimated 4 are installed; follow the orientation mapping from T2.

### T6 — Mixer basics

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Per-track volume, mute and solo, plus a master volume.
- **Done when:**
  - [ ] Track header controls (volume slider, M, S) persisted in `tracks.volume/muted/solo` (columns exist).
  - [ ] The engine applies them live during playback (keep per-track `GainNode`s addressable instead of
        recreating them in `play()`); solo silences non-solo tracks.
  - [ ] Optional track color (needs a migration v2 in `src/lib/db.ts`).
- **Context:** `audio-engine.ts` `play()` currently builds one gain per clip from `PlayableClip.volume`.
  `@expo/ui` has native sliders (skill `expo:expo-ui`).

### T7 — Background recording & interruptions

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Recording survives the lock screen and app switching on both platforms and handles interruptions.
- **Done when:**
  - [ ] Verified on real devices: lock the screen mid-recording on iOS and Android, unlock, the take is complete.
  - [ ] Android: recording notification via `RecordingNotificationManager` (pause/stop actions) while recording.
  - [ ] Interruptions (phone call, Siri, alarm): `AudioManager.observeAudioInterruptions` → stop and save the take
        cleanly; headphone plug/unplug doesn't crash or misroute.
  - [ ] Decide `androidFSStopWithTask` (currently default `true`: swiping the app away ends the recording).
- **Context:** Plugin config is in `app.json` (`iosBackgroundMode`, foreground service types
  `microphone|mediaPlayback`); verified in the generated native projects in T1 but never exercised on a device.
  `AudioRecorder.consumeLastRecordingResult()` recovers a recording the system stopped. iOS has no recording
  notification from the library (Live Activity idea is in Backlog).

### T8 — Export & share

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Share a mixdown of the idea (and single takes) through the system share sheet.
- **Done when:**
  - [ ] Mixdown via `OfflineAudioContext` with the same clip scheduling and track gains as playback.
  - [ ] WAV encoder in JS (16-bit PCM, unit-tested), written with `expo-file-system`, shared with `expo-sharing`
        (`npx expo install expo-sharing`). M4A is a later option.
  - [ ] Share a single take from the clip menu.
- **Context:** The library has no "encode AudioBuffer to file" API (checked in T1); `concatAudioFiles` only joins
  recorder segments. Export files go to the cache directory and are deleted after sharing.

### T9 — Tempo, metronome & count-in

- **Status:** ready
- **Session:** Sonnet · high effort · plan mode off
- **Goal:** Optional tempo grid for musicians who want it.
- **Done when:**
  - [ ] Project BPM and time signature (migration v2+); bar/beat grid lines on the timeline.
  - [ ] Click track generated in code (short buffers on the context clock — not an instrument), toggle on/off,
        not recorded into takes; count-in of one bar before recording.
  - [ ] Snap to grid while editing (extends T5's snapping).
- **Context:** Scheduling helpers live in `audio-engine.ts`. Quantize (moving clips/notes to the grid) stays in
  Backlog.

### T10 — Ideas library polish

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Manage ideas: rename, duplicate, delete, find.
- **Done when:**
  - [ ] Rename (project screen header and list), delete with confirmation (swipe or context menu), duplicate
        (copies rows; takes can be shared by copying files).
  - [ ] Sort (recent / name) and search when the list is long; show the date under each idea.
  - [ ] Storage used by recordings shown in Settings.
- **Context:** `deleteProject` (rows + files) and `useDeleteProject` (also clears decoded buffers) already exist in
  `src/features/projects/` but have no UI yet. Names default to "Idea N" (`createProject`).

### T11 — Identity & store prep

- **Status:** ready
- **Session:** Sonnet · low effort · plan mode off
- **Goal:** Final name, icon and store-facing details before the first store release.
- **Done when:**
  - [ ] Final display name (or confirm "Audio Recorder"); bundle ID `com.didrio.audiorecorder` confirmed (permanent
        once on a store).
  - [ ] Real app icon (`assets/app.icon` for iOS 26, Android adaptive icon + its `backgroundColor` in `app.json`),
        splash image and colors — artwork from the user, not invented.
  - [ ] Store listing text and screenshots plan (`docs/new-app-checklist.md`).
- **Context:** All of these are still the base template's placeholders.

## Backlog

Ideas that aren't ready to work on yet. Promote them to "Up next" with full detail when they are.

- Quantize clips to the tempo grid (after T9).
- Pitch correction for vocal takes (the library's `createBufferSource({ pitchCorrection })` is for playback-rate
  changes, not tuning; would need a native DSP library).
- Loop a region; punch-in recording over a range.
- Input monitoring through headphones; input gain; input device picker (`AudioManager.getDevicesInfo`).
- Simple effects per track (reverb, EQ) via the audio graph.
- Backup / sync (iCloud Drive, Google Drive) — the data model uses UUIDs and relative paths to make this possible.
- iOS Live Activity while recording (lock screen timer + stop).
- Maestro 2.12.1 hung in T1 before connecting to the iOS 27.2 simulator (log stops after "Created execution
  plan"; XCTest driver never started), although runs earlier the same day worked. Try `maestro` upgrade /
  `xcrun simctl shutdown all` + reboot sim; if it's a Maestro/Xcode 27 issue, fix it in the base repo.

## Done

- T1 — Shape the app — 2026-11-11 — idea agreed (multitrack song sketchpad), recording red, react-native-audio-api engine + background config, SQLite non-destructive data model, Ideas list with quick-capture record button, project screen recording/playing takes on track 1, T2–T11 written
