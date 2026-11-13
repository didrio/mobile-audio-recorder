# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T4 — First preview build · Opus · high effort · plan mode off

## In progress

### T4 — First preview build

- **Status:** in progress
- **Session:** Opus · high effort · plan mode off (scripted in `docs/releasing.md`, but the first real-device
  recording test may surface audio bugs like the stacked-clips one)
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
  **Milestone checks** (deferred from T2): `npm run android` on the `Pixel_API_36` emulator (first build with
  Skia: needs a few GB of disk), timeline screenshots portrait + landscape on Android, `npm run e2e` on both
  platforms. On devices: pinch-zoom and pan momentum feel, tap-to-seek and dragging the playhead on the ruler,
  playhead vs. audio sync (latency), and smooth playback on a 3-minute idea with several takes.
  **Overdub checks** (from T3, simulator-only so far): with headphones, record a clap/click against an existing
  take and play both back — they should line up; if not, tune Settings → Recording → Latency offset and note
  the value per device in `docs/releasing.md`. Also try Bluetooth headphones (much higher latency), delete a
  track from its sheet, and `npm run e2e` includes the new `.maestro/overdub.yaml`.
  **From the post-T3 polish** (simulator-only so far): record over the middle of an existing take on the same
  track (it should replace that part: three clips end to end), then Play several times in a row and seek while
  playing. Playback once went silent after repeated tries before the fix; confirm it stays audible.

## Up next

Product in one line: a quick multitrack sketchpad for musicians (2–3 min song ideas), with a simple horizontal
timeline (time left→right, tracks are rows) that works well in both portrait and landscape.
Not a DAW: no software instruments. Local only. Architecture and data model: `docs/decisions.md` (Audio engine,
Project data, Drawing) and the header comments of `src/lib/db.ts` and `src/features/audio/audio-engine.ts`.
Testing cadence while iterating: unit tests + `npm run check` + simulator screenshots per ticket, then the user
tries it; Maestro, the Android emulator and the two-platform export only at milestones (T4, releases, native
dependency changes). See the `wrap` skill.

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
  - [ ] Moving a clip onto others replaces what's under it, like recording does (`clearRange` in
        `src/features/projects/clip-overlap.ts`); undo restores the trimmed clips.
  - [ ] Unit tests for the pure edit operations (move/trim/split math).
- **Context:** Data model is already non-destructive (`clips.start/offset/duration`, `src/lib/db.ts`). Timeline
  (T2, made horizontal-only in the post-T3 polish): gestures are RNGH v3 hooks composed with
  `useSimultaneousGestures` in `timeline.tsx` (pan = scroll, pan starting on the ruler = drag the playhead, pinch =
  zoom, tap anywhere = seek). Tap on a clip should become "select" and tap on empty lane space keep seeking.
  x ↔ time is `LEADING_SPACE + (t - scroll) * zoom` (`seekable()` / `toX` in `timeline.tsx`). Waveform
  paths are cached per clip window (`waveform-path.ts`), so a trim just asks for a new window. Drawing is one
  `createPicture` per frame: add selection/handles there, driven by shared values.
  Since T3: track header chips (`track-headers.tsx`, RN views over the lane corners) take touches there; the
  armed track is `useState` in `project-screen.tsx` (move it into the editor store); moving a clip between
  tracks can reuse takes left by `deleteTrack` (they're kept).

### T6 — Mixer basics

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Per-track volume, mute and solo, plus a master volume.
- **Done when:**
  - [ ] Track header controls (volume slider, M, S) persisted in `tracks.volume/muted/solo` (columns exist).
  - [ ] The engine applies them live during playback (keep per-track `GainNode`s addressable instead of
        recreating them in `play()`); solo silences non-solo tracks.
  - [ ] Optional track color (needs a migration v2 in `src/lib/db.ts`).
- **Context:** `audio-engine.ts` `play()` currently builds one gain per clip from `PlayableClip.volume`;
  recording plays the other tracks through the same `play()` (backing), so mute/solo must apply there too.
  Header controls go in the chips of `src/features/timeline/track-headers.tsx` (or the track sheet,
  `src/features/project/track-sheet.tsx`, if the chips get crowded in portrait).
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
- **Context:** Scheduling helpers live in `audio-engine.ts`. Grid lines go in the timeline picture next to the
  ruler ticks (`rulerSteps` in `timeline-math.ts`). Quantize (moving clips/notes to the grid) stays in Backlog.

### T10 — Ideas library polish

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Manage ideas: rename, duplicate, delete, find.
- **Done when:**
  - [ ] Rename (project screen header and list), delete with confirmation (swipe or context menu), duplicate
        (copies rows; takes can be shared by copying files).
  - [ ] Sort (recent / name) and search when the list is long; show the date under each idea.
  - [ ] Storage used by recordings shown in Settings.
  - [ ] Quick listen: play an idea from the list without opening it, with a scrubber under the row
        (reuse `play()` from `audio-engine.ts` with the idea's clips; only one idea plays at a time).
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
- Timeline performance with many tracks × long ideas: if frames drop, cache one `SkPicture` per clip (redrawn
  only when the clip or zoom level changes) instead of drawing every path each frame.
- Overdub polish: show the live take at its compensated position while recording (it jumps by the latency
  on Stop); count-in arrives with T9; input monitoring is above.
- Maestro: `tapOn` by `accessibilityLabel` doesn't focus a `TextInput` on iOS (tap by point instead).
- Clock text runs ~0.1–0.3 s ahead of the playhead (the playhead includes output latency). Show the clock from
  the playhead instead once a cheap way to do it without per-frame React renders exists.

## Done

- Polish after T3 — 2026-11-13 — timeline horizontal in both orientations (vertical portrait layout removed with
  `timeline-axis.ts`), waveforms scaled to one shared per-project level (true relative loudness), tap anywhere to
  seek, drag on the ruler to move the playhead (with a handle), leading space before 0:00, transport is
  Back to start · Play (largest, centered) · Record, headphones hint removed; recording onto a track now replaces what's
  under the new take (overlapped clips trimmed/split, `clip-overlap.ts`; takes kept), clips outlined,
  playback cancels superseded starts and releases its audio graph, the view no longer jumps away from the
  playhead after Stop (zoom fit runs on the UI thread)

- T3 — Multitrack overdub — 2026-11-13 — add/rename/delete/arm tracks (lane headers + track sheet), record at the playhead over the other tracks with measured start + latency compensation and a Settings offset, live waveform; fixed the playhead clock (JS and UI `performance.now()` differ, `ui-clock.ts`); overdub Maestro flow
- T2 — Timeline view — 2026-11-11 — Skia timeline (lanes, clips with cached waveform peaks, ruler, UI-thread playhead with follow), pan/pinch/ruler seek, Play from the playhead, portrait/landscape layouts; Maestro hang traced to NTKDaemon on port 5563 (e2e warns now); smoke flow covers quick capture
- T1 — Shape the app — 2026-11-11 — idea agreed (multitrack song sketchpad), recording red, react-native-audio-api engine + background config, SQLite non-destructive data model, Ideas list with quick-capture record button, project screen recording/playing takes on track 1, T2–T11 written
