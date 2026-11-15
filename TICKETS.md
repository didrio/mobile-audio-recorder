# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T39 — Hear yourself · Opus · high effort · plan mode on

## In progress

_None._

## Up next

Product in one line: a quick multitrack sketchpad for musicians (2–3 min song ideas), with a simple horizontal
timeline (time left→right, tracks are rows). Portrait only (`orientation` in `app.json`): landscape isn't a
good experience for this app and isn't designed or tested.
Not a DAW: no software instruments (T20's pitch-reference keyboard is a tool, never recorded or on the
timeline). Local only. Architecture and data model: `docs/decisions.md` (Audio engine,
Project data, Drawing) and the header comments of `src/lib/db.ts` and `src/features/audio/audio-engine.ts`.
Testing cadence while iterating: unit tests + `npm run check` + simulator screenshots per ticket, then the user
tries it; Maestro, the Android emulator and the two-platform export only at milestones (preview builds,
releases, native dependency changes). See the `wrap` skill.
**Android paused (since 2026-11-14, until the user says otherwise):** the user can't test on Android for now.
Keep the code cross-platform, but publish preview OTA updates for iOS only (`--platform ios`), make no
Android builds, and leave Android checks in the tickets / Device checks for later.

**Editor design agreed with the user, used by the editor tickets:**

- **Interaction model** for everything on the timeline (clips in T5, section labels in T18): tap selects
  (highlight, edge handles, small floating action bar). Drag a _selected_ item to move it, drag its handles to
  trim or resize. Long-press an unselected item to pick it up and move it in one go (haptic on pickup).
  Dragging an unselected item scrolls the timeline, so nothing moves by accident. Tapping a clip never moves
  the playhead. Tapping empty lane space or the ruler seeks and deselects. Tapping a section label also jumps
  the playhead to its start.
- **Layout**: fixed 88 pt lanes. A narrow pinned column on the left holds one grab handle per track
  (long-press to reorder); the sliders button in the corner above it expands it into a mixer (info · Mute ·
  Solo · horizontal volume), pushing the timeline right. Tapping a track's floating name pill arms it (red
  outline and dot on the pill), and the mixer's info button opens the track's sheet (Rename, Delete; no
  Duplicate). Mute/solo also show as M/S badges on the pills, and silent tracks' clips are drawn faded. The
  section-label rail sits above the ruler. Thin status strip (time · Notes (T24) · Keyboard (T20) · Metronome
  (T17) · Snap (T31) · meter). Compact transport. "+ New Track" is a row after the last lane, not a header
  button. Sheets over the idea that need the playhead (notes, clip options) reach the transport through
  `src/features/project/transport-link.ts`.
- **Header of an idea**: Undo · Redo · "⋯" (Idea settings, Notes, Export… (T36), Duplicate, Delete, Favorite). The menu has disabled
  placeholders: items in `src/features/project/idea-menu-items.ts`, iOS `Stack.Toolbar.Menu` in
  `project-screen.tsx`, Android `@expo/ui` Compose dropdown via `src/components/android-header-menu.android.tsx`. Enable an item
  by giving it an action in `project-screen.tsx` (`menuActions`; Duplicate and Delete are live from T10).
- **Undo/redo** covers every edit, in memory per open idea (100 steps), cleared when leaving the idea. A new
  edit is a pure builder in `src/features/project/edit-commands.ts` returning an `Edit` (before/after snapshots
  of the rows it touches, `edit-changes.ts`), applied with `executeEdit()` from `editor-store.ts`. One gesture =
  one `executeEdit` at its end (live values during a drag go through shared values). A new table (sections,
  idea settings) needs a `Change` variant, `applyToProject` and `saveChanges` support.
- **Arming**: a toggle, one armed track at a time (one phone mic would only record the same audio onto each
  track; arming several tracks for an audio interface's separate inputs is "Multi-input recording" in
  Backlog). Nothing armed → Record grayed out.
- **Ideas list**: sort options (no manual drag ordering), folders with unlimited depth, Favorites as a virtual
  folder.

### T39 — Hear yourself

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Hear your own input in headphones while recording (input monitoring), as an option.
- **Done when:**
  - [ ] "Hear yourself" toggle (status strip or the armed track's controls, off by default) with a level
        slider. Only offered with headphones or an interface output, never on the speaker (feedback); a note to
        leave it off when the interface does its own direct monitoring.
  - [ ] Its latency is measured and shown; if it's too high to play along to, say so instead of offering it.
  - [ ] What you hear never ends up in the take, and monitoring follows the input chosen in T38.
  - [ ] A Device checks line (latency feel with wired headphones vs. Bluetooth, no feedback on the speaker).
- **Context:** First check whether `react-native-audio-api` offers a low-latency live input node for
  monitoring; if not, monitoring needs native work: say so before coding. From T38: the chosen input and
  channel are `currentInputSelection()` in `src/features/audio/audio-route-store.ts` (a multi-channel input is
  opened whole; pick `channel`), headphones vs speaker is `useHeadphones()` / `currentOutputRoute()` there, and
  native input work can go in `modules/audio-input` (iOS `AVAudioSession`).

### T7 — Background recording & interruptions

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Recording survives the lock screen and app switching on both platforms and handles interruptions.
- **Done when:**
  - [ ] Verified on real devices: lock the screen mid-recording on iOS and Android, unlock, the take is complete.
  - [ ] Android: recording notification via `RecordingNotificationManager` with a Stop action (the app has no
        paused-recording state) while recording.
  - [ ] Interruptions (phone call, Siri, alarm): `AudioManager.observeAudioInterruptions` → stop and save the take
        cleanly; headphone plug/unplug doesn't crash or misroute.
  - [ ] Decide `androidFSStopWithTask` (currently default `true`: swiping the app away ends the recording).
- **Context:** Needs a fresh build on both phones, so run the **Device checks** below in the same session.
  Plugin config is in `app.json` (`iosBackgroundMode`, foreground service types `microphone|mediaPlayback`);
  verified in the generated native projects but never exercised on a device.
  `AudioRecorder.consumeLastRecordingResult()` recovers a recording the system stopped. iOS has no recording
  notification from the library (Live Activity idea is in Backlog).

## Device checks

Run these with the next build on real phones (T7 needs one anyway, or before a release; see the `release`
skill). Fix or ticket what fails, then delete the line.

- Inputs & outputs (T38), needs a new build (local module `audio-input`): Settings → Recording → Input lists the
  mic, a wired headset and a USB interface; picking the interface sticks after unplug/replug (Automatic records
  while it's out, also mid-take: the take keeps going). Two-input interface: guitar in input 2, Channel "Input 2"
  → the take has the guitar at full level and nothing from input 1; the meter follows input 2. AirPods with
  "Phone's mic with Bluetooth" on: playback stays high quality, the phone mic records; off: the AirPods mic
  records (call quality, or high quality on iOS 26 with recent AirPods) and the footer explains it. The route
  button next to Output switches speaker ↔ AirPods and the label follows. Input gain slider on the built-in mic
  (shown only when iOS allows it) changes the level and is back after relaunch. Latency: clap test per route
  (speaker, wired, Bluetooth, USB), the "For …" label shows the route being tuned, and an old offset moved to
  the route used first. Clip: clap loud into the mic while armed and while recording, the meter turns red with
  the mark at the end for ~1.5 s. A 16-bit take plays, trims and exports. Android (never run): the input list,
  Output name by priority, channel extraction in Kotlin.

- Export (T36/T37), needs a new build (local module `audio-export`, expo-sharing): on an iPhone, send an M4A mix
  by Messages and AirDrop, Save to Files, open it in another app; a stems zip opens in Files and its stems line
  up dropped into GarageBand/Logic at bar 1 together with the `tempo.mid` (tempo, markers); "Separate files"
  shares several at once. Listen: the export sounds like Play (fades, clip gain, mute/solo, section cuts don't
  click). A long idea (3 min, 8 tracks): time it and watch memory. Android (never run; the Kotlin module only
  compiled): M4A (MediaCodec) plays, the chooser for one and several files, the select-mode bar with three
  actions.

- Recently Deleted (T41): delete a folder holding ideas and a subfolder, restore it (contents come back); delete
  an idea out of a folder, then the folder, then restore the idea (lands at the root); Delete Now frees the audio
  (Settings → Storage); Android: the screen's Select / Select All header and the long-press sheet. The 30-day
  purge was only unit-tested.
- Ideas folders (T19) on Android: the long-press menu bottom sheet (`useActionMenu`), the select-mode bar at the
  bottom of the screen, header Select / Sort / "+" and the Select All / Done header in select mode.
- Android preview APK installs; an OTA update (`npm run update:preview`) published after the builds arrives on
  both phones (Settings → Update shows an update ID after two cold starts).
- Recording: mic permission prompt, speaker vs. earpiece routing, Bluetooth headphones.
- Overdub with headphones: record a clap against an existing take, they line up; if not, tune Settings →
  Recording → Latency offset for that phone. Bluetooth too (much higher latency).
- Record over the middle of a take (three clips end to end), then Play several times and seek while playing;
  playback stays audible.
- Arming & meter (never run anywhere yet): the orange mic indicator shows only while a track is armed (off
  after disarming, opening the track sheet, or backgrounding); the meter follows the voice while armed and idle;
  Record right after arming starts fine and lines up. If the meter stays empty, the library can't open the mic
  without a file (`setMetering` in `audio-engine.ts`). Bluetooth headphones may drop to "call" audio while the
  mic is open; if that's bad, meter only while recording when Bluetooth output is active.
- Pre-roll & punch-in (T25): with headphones, record a clap, then arm another track, turn pre-roll on, put
  the playhead just before the clap and clap along; both claps line up and the armed track's old audio stops
  cleanly (no click) at the punch. Record during playback: the armed track plays until the punch with no gap.
  Off by more than a few ms → `fileStartPosition` / `choosePunch` in `take-alignment.ts`, `cutTrackAt` in
  `audio-engine.ts`.
- Clip editing (T5): drag a clip near the left/right and top/bottom edges (the view auto-scrolls; never tried),
  long-press pickup feel (250 ms) and the snap haptic; move/trim/split while playing restarts playback from
  where it is without a long gap or a click.
- Visual metronome (T33): phone flat on a desk ~1.5 m away, metronome on (Both): the lit block and the
  click land together, the flash reads in peripheral vision, numbers are legible. Early/late → tune
  `DISPLAY_LEAD_SECONDS` / `FLASH_SECONDS` / `LIT_REST_OPACITY` in `src/features/project/beat-display.tsx`
  (a bigger `BEAT_DISPLAY_HEIGHT` if too small). With pre-roll, the run-up counts in on the blocks before 0:00.
- Mixer: drag a volume while playing (smooth, no clicks), mute/solo during playback and during an overdub
  (backing changes, the take doesn't).
- Reorder: grip lights up at once, haptic after the hold, other lanes glide, auto-scroll near the edges with
  many tracks, no jump on drop; also check light mode.
- Timeline: pinch-zoom and pan momentum, tap-to-seek, dragging the playhead on the ruler, playhead vs. audio
  sync, smooth playback on a 3-minute idea with several takes.
- Idea settings & grid (T9, only seen on the iOS simulator in dark mode): the sheet in light mode and on Android
  (formSheet, Switch, number-pad keyboard over the BPM field), Tap tempo by hand, ± buttons then Undo (one step),
  grid on: drag a clip near a bar/beat line (snap guide + haptic), pinch-zoom (beat lines fade, bar numbers
  thin out), 6/8 and 12/8 group lines, light-mode line contrast, pre-roll with the grid on lands on the bar
  (Settings → Pre-roll → Grid on).
- Ideas list (T10, only seen in a screenshot on iOS): swipe left on a row (Rename/Duplicate/Delete), long-press
  menu, Rename dialog, Duplicate then delete the original (the copy still plays), "+" → New Idea, sort menu
  persists, search (on iOS 26 the search field may sit in the bottom toolbar: check it's findable), Settings →
  Storage updates after deleting. Android: header Sort/Add dropdowns (Compose, never run), long-press alert.
- Metronome (T17, simulator has no sound, so never heard): with headphones, metronome on, record a clap on the
  click and check it sits on the beat line (else the click and takes disagree: `scheduleClicks` in
  `audio-engine.ts` vs `take-alignment.ts`); the click never shows up in the take; accents (4/4 downbeat, 6/8
  groups) sound distinct; pre-roll with the metronome on counts in whole bars, also from 0:00 (clicks before
  0:00); clicks keep going past the last clip while recording, and on an empty idea; toggling it and moving the
  volume slider while playing apply at once without stutter. Clicks at very low volume / loudness vs. takes.
- Silent recording (T34, iPhone, no headphones): Settings → Silent while recording on. Pre-roll on: the
  run-up plays, then silence; the take has no backing or click at its start (listen to its first 0.2 s solo).
  Pre-roll off: nothing plays at all. Record while playing: the punch comes a beat later, take clean. Play
  after Stop sounds normal; with headphones nothing changes. Bleed at the take's start → raise
  `SILENT_FADE_LEAD_SECONDS`; a long gap before the punch → lower it (`take-alignment.ts`).
- Snap & grid (T31, iPhone): drag the playhead on the ruler with Snap on: it clings to beat lines with a light
  haptic and moves freely between them (10 pt reach; too sticky or too weak → `SNAP_POINTS` in `grid-math.ts`);
  tap near a beat line lands exactly on it. Snap off: dotted fainter lines, clips drag freely. Beat lines
  readable in light mode outdoors but still lighter than bar lines (`GRID_BEAT_ALPHA`, `GRID_LOOSE_FADE` in
  `timeline.tsx`). Pre-roll icon right of Record is easy to hit; Record new idea has no grid, "+" has one.
  Live waveform while recording with pre-roll (T35) sits inside the red clip. Android: the Snap and pre-roll icons.
- Loop (T26, iPhone, never heard): loop a region that cuts through a sustained note or chord and listen at the
  wrap: no gap, no click (else lengthen `LOOP_FADE_SECONDS` in `loop-math.ts`, 5 ms). Let it loop for a few
  minutes: the playhead and audio stay together, the metronome (on) clicks on the beat across the wrap.
  Handles: drag both ends with the grid + Snap on (whole bars, haptic per bar) and off; the start handle vs.
  the playhead handle when they overlap. Toggle Loop and drag a handle while playing (short restart, no
  stutter). Record while looping: the loop stops and recording starts from there, backing straight through.
- Sections (T18, iPhone): tap empty rail (picker), tap a section (playhead jumps, also while playing), drag
  the body and both handles with the grid + Snap on (bar haptic) and off (snap guide + haptic to clip edges and
  the playhead), long-press pickup of an unselected section, a section stopping at its neighbor; the note glyph
  and right handle on a section whose end is on screen; the 4-button bar fits; light mode label contrast.
  Hit-test feel → `HANDLE_REACH`, `RAIL_TAP_REACH`, `RAIL_SIZE` in `timeline.tsx`.
- Idea notes (T24, iPhone): the Notes sheet over a playing idea: Insert time drops the playhead time where
  the cursor is (also while playing and recording), tapping a `[1:23]` link jumps the playhead there (while
  playing, playback continues from there), the keyboard doesn't hide the text being typed (sheet at 0.6 / 0.9),
  the dot on the Notes button, closing the sheet mid-typing keeps the text. Ideas search finds an idea by a word
  in its notes and shows the snippet after the date (not seen: the simulator tool couldn't focus the native
  search bar).
- Clip options (T16, iPhone, never heard): fades in/out sound smooth; no click at trimmed clip edges (3 ms
  declick, `DECLICK_SECONDS` in `clip-envelope.ts`); a clip split in two still plays seamlessly through the
  split; clip gain −∞…+6 dB, applied on slider release (playing: a short restart); Restore full take; all of it
  with Undo. The fade corners and waveform scaling on the timeline in light and dark mode.
- Pitch keyboard (T20, iPhone, never heard: the simulator has no sound): latency feels instant; chords with
  several fingers; sliding across keys plays each one; sliding on the keys doesn't drag the sheet down (if it
  does, the manual gesture's `GestureStateManager.activate` isn't claiming the touch); the tone and its release
  (`NOTE_*` constants in `audio-engine.ts`); playing along with playback; Settings → Pitch keyboard volume;
  octave buttons; a key tapped with VoiceOver sounds briefly. With the mic armed or recording, only what the
  mic hears ends up in a take.
- App icons: the DEV icon on the iPhone home screen (installed 2026-11-14); the PREVIEW icon after the next
  preview build (`npm run build:preview`, iOS only while Android is paused).
- Android: the old "Idea 1" clip drew without a waveform on the emulator (missing take file or peaks?).

## Backlog

Ideas that aren't ready to work on yet. Promote them to "Up next" with full detail when they are.

- Folder polish (from T19, after trying it): a "⋯" in a folder's header to rename / move / delete the folder
  you're in; New Folder inside the Move sheet; Favorite / Unfavorite as a select-mode action. All in
  `projects-screen.tsx` / `move-to-screen.tsx`.
- Loop region polish (from T26, decide after trying it on a phone): the lane tint is drawn under clips, so on
  a full lane it's barely visible (tint over the clips, or dim outside the region instead?); the start handle
  covers the playhead's ruler handle when both sit at the region start (handles win; the default region starts
  at the playhead). Drawing and hit-testing are in `timeline.tsx` (`loopEdgeAt`, `LOOP_REACH_*`).
- Clip options polish (from T16, decide after hearing it): clip gain applies on slider release (a live
  preview while dragging needs an engine hook to reach the playing clip's `GainNode`); fades are presets
  (Off…4 s), not dragged on the clip; Speaker mode's echo reference uses clip gain but ignores fades
  (`echo-reference.ts`), fine unless cleaning of faded clips gets worse.
- `settings-screen.test.tsx` keeps Jest from exiting on its own (a timer or handle from the storage or
  appearance code; pre-existing, seen with T20): `npm run check` passes but Jest force-exits a worker. Find it
  with `npx jest src/features/settings/settings-screen --detectOpenHandles`.
- Loop recording & takes, to rethink with the user after the current Up next list: singing over a loop again
  and again, keeping passes as alternate takes (badge + picker), comping one take from several passes, looping
  a clip or section directly, a punch-out end point. Clips are already windows onto immutable takes (`db.ts`),
  so alternates need no new files.
- Track colors (picked in the track sheet, used for clips and the name pill).
- Track column border weight (open, from T28): vertical edges are 1 pt (mixer toggle, each track cell in
  `track-column.tsx`), every horizontal divider is a hairline (lane separators in `timeline.tsx`, the "New
  Track" row in `lane-overlay.tsx`). The user finds the "New Track" top line fainter than the vertical border.
  Decide: all dividers 1 pt, or the verticals hairline; then check light mode, the open mixer and 8 tracks.
- Quantize clips to the tempo grid (T9 is done: `project.bpm`, `grid-math.ts`; clips only snap while dragging).
- Pitch correction for vocal takes (the library's `createBufferSource({ pitchCorrection })` is for playback-rate
  changes, not tuning; would need a native DSP library).
- Multi-input & stereo (decided 2026-11-14: not needed yet, T38 picks one input at a time): with a
  multi-input audio interface, arm several tracks and record each input onto its own track in one pass (a
  band, or a mic'd guitar + vocal); stereo takes (`takes.channels`; playback, waveform, split/trim and export
  handle two channels) for stereo mics or a keyboard's L/R outputs; the click sent only to an interface's
  headphone output. Revisit if users with interfaces ask.
- Project file sharing (asked 2026-11-14: not now): an idea or folder as one file another phone running the
  app opens as an editable idea; the same format would give a library backup. Audio export is T36/T37.
- Quick listen: play an idea from the Ideas list without opening it, with a scrubber under the row (reuse
  `play()` from `audio-engine.ts`; only one idea plays at a time).
- First-class chord progressions per section (chord picker, chord symbols drawn on the section rail). Revisit
  once T24's idea notes and T18's section notes have been used for a while.
- Tuner: show the pitch the mic hears (note + cents), next to T20's keyboard (`nearestNote` in
  `src/features/audio/pitch.ts` already maps a frequency to note + cents; needs pitch detection on mic buffers).
- Pitched, not agreed yet (recording-focused tools, not DAW features):
  - Flag button while playing or recording: drops a `[1:23] ★` time stamp into the idea's notes (T24 is done:
    `insertTimeStamp` / `setIdeaNotes`) to mark "that part was good".
  - Latency auto-calibration in Settings → Recording: plays clicks from the speaker, hears them with the mic,
    and sets the offset, instead of tuning it by ear.
  - Slow listening (0.5× / 0.75×, pitch kept, via `createBufferSource({ pitchCorrection })`) for working out
    what you played or learning a part.
  - Quick capture from the lock screen, Control Center or a home-screen widget: start recording a new idea in
    one tap (native work, needs a dev build).
- Bring back Speaker mode (shelved in T42): set `SPEAKER_MODE_ENABLED = true` in `@/lib/echo-canceller` for iOS
  (then run the old checks: clap test of a cleaned take, cleaning time on a 2–3 minute take, Light vs Strong on
  guitar, headphones leave the take untouched, the "Use Visual" hint when armed without headphones). Android
  needs the module ported: CMake builds `cpp/echo_cancel.c` (`dr_wav.h` is header-only), a JNI function and a
  Kotlin `EchoCancellerModule` with the same `cleanTake` as the Swift one, and `expo-module.config.json` lists
  `android`.
- Simple effects per track (reverb, EQ) via the audio graph.
- Backup / sync (iCloud Drive, Google Drive) — the data model uses UUIDs and relative paths to make this possible.
- iOS Live Activity while recording (lock screen timer + stop).
- Timeline performance with many tracks × long ideas: if frames drop, cache one `SkPicture` per clip (redrawn
  only when the clip or zoom level changes) instead of drawing every path each frame.
- Overdub polish: show the live take at its compensated position while recording (it jumps by the latency
  on Stop).
- Maestro: `tapOn` by `accessibilityLabel` doesn't focus a `TextInput` on iOS (tap by point instead).
- T30 — Possible swipe-seeks bug: very likely fixed in T5 (the timeline tap had no `maxDistance`, so a
  quick swipe also counted as a tap at its start; now `TAP_SLOP`). Original note: in one Maestro run on the iOS simulator, a second lane swipe
  started right after the first (maybe during momentum) moved the playhead to its touch-down point (0:17.5)
  instead of only scrolling. Might be how Maestro swipes; check by hand on a device first. If real, tap-to-seek
  in `timeline.tsx` must not fire on a drag or on a touch that only stops momentum (`cancelAnimation(scroll)`
  in the pan's `onBegin`).
- Clock text runs ~0.1–0.3 s ahead of the playhead (the playhead includes output latency). Show the clock from
  the playhead instead once a cheap way to do it without per-frame React renders exists.
- Reorder drag: while a lifted lane passes over a track whose name pill hasn't slid away yet, that pill draws
  on top of the lifted lane for a moment (pills are RN views above the Skia canvas). Could hide or fade the
  passed pills, or draw the lifted pill above; only if it bothers on a device.

## Done

- T38 — Inputs, outputs, Bluetooth & latency per route — 2026-11-15 — everything in Settings (the user's call;
  the editor only gets a red clip hold on its meter, `clip-hold.ts`, no "Too loud" text): Recording → Input
  screen (`input-screen.tsx`: Automatic or a device, remembered by id then name+category in
  `input-devices-store.ts`, fallback while unplugged; Channel Input 1…N for multi-channel inputs; Input gain
  where iOS allows), Output name + iOS `AVRoutePickerView`, Bit depth 16/24, "Phone's mic with Bluetooth" (off:
  `allowBluetoothHFP` + iOS 26 `bluetoothHighQualityRecording`), latency offset per output route (persist v2
  migration, old value claimed by the first route seen). Live route in `audio-route-store.ts` (synced from the
  root layout); pure rules in `audio-route.ts`. Multi-channel takes are recorded whole and the chosen channel
  extracted to mono after Stop by the new local module `modules/audio-input` (also channel count, gain, route
  button). New iOS dev build; simulator light + dark (Settings, Input picker, a take); Maestro skipped
  (NTKDaemon), Android not run
- T37 — Stems & batch export — 2026-11-15 — export sheet Mix / Stems: one file per track over the same range
  (`planExport` in `export-plan.ts`: numbered `01 Vocals.m4a`, de-duplicated names, muted skipped unless asked,
  "Apply track volume"), extras click track / the mix / "Tempo & markers" (`tempo-midi.ts`: format 0 SMF,
  tempo per quarter so x/8 converts, time signature, section markers) and an always-included `info.txt`; one
  stored zip streamed to disk (`zip.ts`, fflate) or separate files through the module's `shareFiles`.
  Normalize on stems = one gain for every file (measuring pass), so the balance stays. Batch: select mode gets
  Export (picked ideas + ideas in picked folders) → `export-batch` sheet → each whole mix, one zip (`exportIdeas`).
  iOS hides the tab bar in select mode (`tab-bar-store.ts`) so the three toolbar actions fit. Simulator light +
  dark: stems zip (5 files, all 35.659 s), separate files share sheet, MIDI bytes, info.txt, batch; Android not
  run
- T36 — Export a mix — 2026-11-15 — "Export…" in the idea "⋯" menu, the row's swipe (first action) and long-press
  menu → `export/[id]` sheet: range (whole idea to the last heard clip, loop region, any section), M4A (default)
  / 24-bit WAV at the takes' rate, Include click, Normalize to −1 dBFS (off: rendered peak check warns when it
  would clip), "Add BPM to name" (choices remembered in `export-settings-store.ts`), progress + Cancel, temp
  files deleted after the share sheet closes and at launch. Rendering: `audio-graph.ts` holds the clip/envelope/
  track-gain/click graph code that `play()` and `offline-render.ts` (`OfflineAudioContext`) both use, with a
  5 ms fade where a range cuts a clip. WAV encoder in JS (`wav.ts`); M4A by the new local module
  `modules/audio-export` (iOS `AVAudioFile`, Android `MediaCodec`+`MediaMuxer`); one file shared via
  expo-sharing. New dev build made (iOS). Simulator: real M4A (AAC 48 kHz mono, 35.66 s, peak −1.0 dBFS) and a
  section WAV (exactly 15.000 s, 24-bit) checked with afinfo; never heard on a phone
- T41 — Recently Deleted — 2026-11-15 — soft delete (`deleted_at` on `projects` and `folders`, migration v13): `deleteItems`
  stamps a folder's whole subtree with one shared time; `recently-deleted.ts` (pure rules: nested vs top-level,
  restore destination, days left), `trash-repo.ts` (list, restore to the original folder or root, Delete Now,
  `purgeExpired` at launch from `_layout.tsx`, deleted bytes); Recently Deleted screen with select mode and a root
  row (shown only when non-empty); lists, search, Favorites and counts skip deleted items; Settings → Storage
  counts them separately. Simulator: delete, row, screen, Restore (light); dark mode, folders and Android not seen
