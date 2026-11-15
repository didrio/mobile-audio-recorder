# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T19 — Folders & favorites · Opus · high effort · plan mode on

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
- **Header of an idea**: Undo · Redo · "⋯" (Idea settings, Notes, Duplicate, Delete, Favorite). The menu has disabled
  placeholders: items in `src/features/project/idea-menu-items.ts`, iOS `Stack.Toolbar.Menu` in
  `project-screen.tsx`, Android `@expo/ui` Compose dropdown via `src/components/android-header-menu.android.tsx`. Enable an item
  by giving it an action in `project-screen.tsx` (`menuActions`; Duplicate and Delete are live from T10).
- **Undo/redo** covers every edit, in memory per open idea (100 steps), cleared when leaving the idea. A new
  edit is a pure builder in `src/features/project/edit-commands.ts` returning an `Edit` (before/after snapshots
  of the rows it touches, `edit-changes.ts`), applied with `executeEdit()` from `editor-store.ts`. One gesture =
  one `executeEdit` at its end (live values during a drag go through shared values). A new table (sections,
  idea settings) needs a `Change` variant, `applyToProject` and `saveChanges` support.
- **Arming**: a toggle, one armed track at a time (multi-arm deferred to Backlog: one phone mic would only
  record the same audio onto each track). Nothing armed → Record grayed out.
- **Ideas list**: sort options (no manual drag ordering), folders with unlimited depth, Favorites as a virtual
  folder.

### T19 — Folders & favorites

- **Status:** ready (after T10)
- **Session:** Opus · high effort · plan mode on
- **Goal:** The Ideas tab works like a simple file system: nested folders, favorites, moving things around.
- **Done when:**
  - [ ] Migration: `folders` table (id, parent_id nullable → root, name, created_at, updated_at, cascade on
        delete), `projects.folder_id` (null = root), `projects.favorite`.
  - [ ] A `folder/[id]` route in the Ideas stack reuses the list screen for a folder's contents. Back goes up a
        level. No depth limit.
  - [ ] Root shows a Favorites row pinned at the top (a virtual folder with every starred idea, wherever it
        lives), then folders, then ideas. Folders always list before ideas, and T10's sort applies within
        each.
  - [ ] Star/unstar from the row's swipe action, the long-press menu and the idea's "⋯" menu. Starring doesn't
        move the idea.
  - [ ] "+" menu: New Idea (created in the current folder), New Folder. Rename folder; delete folder with a
        confirmation that gives counts ("Delete 'Demos' and its 2 folders and 9 ideas?"), deleting its
        contents and their files.
  - [ ] "Move to…" on ideas and folders: folder picker sheet (a folder can't be moved into itself or a
        subfolder of itself). Select mode (Edit) for moving or deleting several at once.
  - [ ] Search spans every folder and shows each result's folder path.
  - [ ] Unit tests for the tree logic (descendants, move validation, delete counts).
- **Context:** The Ideas search already matches idea notes too (T24: `filterIdeas`, `notesMatch` in
  `ideas-list.ts`, shown as a snippet after the date in `idea-row.tsx`); keep that working in folders and
  Favorites. The idea's "⋯" Favorite placeholder is in `idea-menu-items.ts` / `menuActions` in
  `project-screen.tsx`. The Ideas stack is `src/app/(tabs)/(home)/`. `deleteProject` deletes rows + files; T10's list code (`ideas-list.ts` sort/filter, `idea-row.tsx`, `idea-actions.ts`, `rename-idea-dialog.tsx`) is meant to be reused for a folder's contents; deleting a
  folder must do that for every idea under it. A "Recently Deleted" safety net is in Backlog.

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

### T32 — Speaker mode on Android

- **Status:** blocked (Android paused, see the top of this file)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** The echo canceller from T21 on Android.
- **Done when:**
  - [ ] `modules/echo-canceller` gets an Android side: CMake builds `cpp/echo_cancel.c` (no other native
        deps; `dr_wav.h` is header-only), a JNI function, and a Kotlin `EchoCancellerModule` with the same
        `cleanTake` as the Swift one; `expo-module.config.json` lists `android`.
  - [ ] Settings shows the Speaker mode switch on Android (it hides itself when the module is missing).
  - [ ] Tested on the Android phone with the T21 checklist.
- **Context:** The Swift wrapper (`modules/echo-canceller/ios/EchoCancellerModule.swift`) is the model;
  everything platform-independent is in C already. `@/lib/echo-canceller` loads the module with
  `requireOptionalNativeModule`.

## Device checks

Run these with the next build on real phones (T7 needs one anyway, or before a release; see the `release`
skill). Fix or ticket what fails, then delete the line.

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
  Speaker mode without headphones: the "Use Visual" line shows when armed and idle; Visual records no click.
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
- Speaker mode (T21, iPhone dev build): clap test of a cleaned take (does it still line up?), cleaning time
  on a 2–3 minute take, Light vs Strong on guitar; recording with headphones connected keeps the take
  untouched (no "Cleaning up take…").
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
- Export & share (deferred): mixdown via `OfflineAudioContext` + a JS WAV encoder, shared with `expo-sharing`;
  consider per-track stems from 0:00 for rebuilding in a DAW. Must match playback (track volume/mute/solo via
  `trackOutputGain` in `mixer.ts`, clip gain/fades from T16 via `envelopePoints` in `clip-envelope.ts`) and leave
  out the metronome and keyboard.
- Track colors (picked in the track sheet, used for clips and the name pill).
- Track column border weight (open, from T28): vertical edges are 1 pt (mixer toggle, each track cell in
  `track-column.tsx`), every horizontal divider is a hairline (lane separators in `timeline.tsx`, the "New
  Track" row in `lane-overlay.tsx`). The user finds the "New Track" top line fainter than the vertical border.
  Decide: all dividers 1 pt, or the verticals hairline; then check light mode, the open mixer and 8 tracks.
- Quantize clips to the tempo grid (T9 is done: `project.bpm`, `grid-math.ts`; clips only snap while dragging).
- Pitch correction for vocal takes (the library's `createBufferSource({ pitchCorrection })` is for playback-rate
  changes, not tuning; would need a native DSP library).
- Input monitoring through headphones; input gain; input device picker (`AudioManager.getDevicesInfo`). With a
  multi-input audio interface: arm several tracks at once, each recording its own input.
- Recently Deleted: soft-delete ideas and folders, keep them 30 days, restore from a "Recently Deleted" folder
  (after T19).
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

- T20 — Pitch reference keyboard — 2026-11-14 — keyboard button in the strip opens a short sheet
  (`src/features/keyboard/pitch-keyboard-sheet.tsx`): as many white keys as fit (≥ 40 pt, one octave + on a
  phone), octave buttons (start remembered), one manual multi-touch gesture follows every finger (chords,
  glissando), held notes named; tone synthesized in the engine (`startNote` / `stopNote`: sine partials,
  attack/decay/release, own bus, `prepareKeyboard` on open); note math in `pitch.ts`; Settings → Pitch keyboard
  volume (`keyboard-settings-store.ts`). Simulator light + dark; never heard
- T16 — Clip options — 2026-11-14 — "Options" in the clip action bar opens a sheet (gain slider, fade in/out
  presets, Restore full take where it fits, Delete), each one undo step, playback picks it up
  (`transport-link.ts` `replay`); `clips.gain/fade_in/fade_out` (migration v11, copied by Duplicate); engine
  plays every clip through its own envelope `GainNode` (`clip-envelope.ts`: gain, fades, 3 ms declick except at
  seamless split joints); split/overlap cuts drop fades on new edges; waveform scales with clip gain, fade
  corners drawn. Simulator light; never heard
- T24 — Idea notes — 2026-11-14 — Notes button in the strip (dot when there are notes) and in "⋯" open a sheet
  (`idea-notes-sheet.tsx`): edit with Insert time (`[1:23]` at the cursor), read mode with time stamps as links
  that seek (also while playing, via `transport-link.ts`); `projects.notes` (migration v10), saved debounced and
  on close, not undoable, copied by Duplicate; Ideas search also matches notes and shows the snippet. Seen on the
  simulator (search snippet: unit tests only)
- T18 — Section labels — 2026-11-14 — colored rail above the ruler (`section-rail.ts`, `section-math.ts`);
  tap empty rail → picker (`new-section.tsx` sheet: 6 presets numbered when repeated, Custom name + palette),
  8 bars / 15 s cut at the next section; tap a section → playhead to its start + action bar (Rename via the
  shared `RenameDialog`, inline Color swatches, Notes sheet `section-notes/[id]`, Delete); move / resize /
  long-press reuse the clip drag state (`dragKind`), stop at neighbors, whole bars with grid + Snap; all undoable
  (`sections` table, migration v9, `Change` variant), copied by Duplicate; palette tokens with a contrast test.
  Simulator light + dark; device check pending
- T26 — Loop region — 2026-11-14 — Loop toggle left of the transport (saved per idea with its region,
  migration v8, not undoable, copied by Duplicate; first turn-on makes 8 s / 2 bars at the playhead); ruler
  band + handle tabs (faint with Loop off), handles hit-tested before scrub, snap to bars with the grid;
  gapless looped playback: clips rescheduled per pass ~1 s ahead with 5 ms crossfades at cuts, clicks follow
  the wrap (`loop-math.ts`, engine `scheduleLoop`); Record while looping stops the loop and records straight
  through. Simulator light + dark; not heard on a device
