# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T47 — Speaker mode on Android, one strong setting · Opus · high effort · plan mode on

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
**Device testing deferred (since 2026-11-15, the user's call):** no phone builds, installs or preview OTA
updates per ticket while the remaining tickets are done. Real-device steps go into **Device checks**, and the
whole list is tested in one pass at the end (a fresh dev or preview build on both phones then).

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
- **Header of an idea** (T44): the title is the idea's menu ("Idea 1 ⌄": Rename, Favorite, Duplicate, Move to…,
  Export… (T36), Delete); items in `src/features/project/idea-menu-items.ts`, iOS SwiftUI `Menu`
  (`idea-title-menu.tsx`), Android Compose dropdown (`idea-title-menu.android.tsx` →
  `src/components/android-header-menu.android.tsx`). Right: Undo · Redo · Settings (sliders), which opens the
  settings sheet with Idea | Recording tabs (`idea-settings-sheet.tsx`; Recording = app-wide rows shared with
  the Settings tab, `src/features/settings/recording-settings-rows.tsx`). Enable a menu item by giving it an
  action in `project-screen.tsx` (`menuActions`). The tab bar stays hidden inside an idea.
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
- **Vertical timeline** (T43, experimental, Settings → Experimental): the same `Timeline` turned sideways, so
  every timeline change must keep working in both. Draw and hit-test in the logical axes (`t` along time, `l`
  across: rail, ruler, lanes), never raw x/y: the picture is transposed in vertical and touches go through
  `pointOf`; text is the exception (`rulerLabel`, the rail's `text`). Sizes come from `timelineLayout` in
  `timeline-math.ts`; `TrackColumn`, `LaneOverlay` and `useReorderStyle` branch on `vertical`.

### T47 — Speaker mode on Android, one strong setting

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Recording without headphones removes the backing (other tracks, the metronome) from the take on iOS
  **and Android**, behind an experimental on/off switch in Settings → Experimental. No Light / Strong choice:
  on means the most aggressive cleanup, tuned harder than today's Strong. The user's call (2026-11-15): push it
  as hard as it goes first, then pull back only where takes sound bad.
- **Done when:**
  - [ ] Settings → Experimental (T43's section) gets a "Speaker mode" switch, off by default, with a footer
        saying it cleans takes recorded without headphones and keeps the original. The old Speaker mode section
        and its Cleanup (Light / Strong) control go away; `SPEAKER_MODE_ENABLED` is removed (or `true`).
        `cleanupStrength` leaves `recording-settings-store.ts` (bump the persist version so old saved values are
        dropped) and cleaning always runs the strongest settings.
  - [ ] Android: `modules/echo-canceller` builds and works there. CMake builds `cpp/echo_cancel.c` (`dr_wav.h` is
        header-only), a JNI function calls `ec_clean_take`, and a Kotlin `EchoCancellerModule` exposes the same
        `cleanTake` as the Swift one (same arguments, result and error messages). `expo-module.config.json`
        lists `android`, so `isEchoCancellerAvailable` is true on both platforms.
  - [ ] Harder cleanup in the shared C core, tuned on the desktop first (`node
modules/echo-canceller/cpp/tests/run.mjs`): start from the extreme end of the knobs below, note the
        reduction in dB for each step, then settle the default with the user listening to takes recorded on the
        phone.
  - [ ] Unit tests for the settings change, the desktop C test passes, `npm run check`. Android at least compiles
        (local `npm run android` build); trying it on a phone waits for Android testing to resume.
  - [ ] A Device checks line for both platforms (new build needed: native code changed; T46's build includes
        it), with the checks from before the shelving: clap test of a cleaned take, cleaning time on a 2–3
        minute take, guitar as well as voice, headphones leave the take untouched, the "Use Visual" hint when
        armed without headphones.
- **Context:**
  - Shelved in T42 (2026-11-14), not removed. `SPEAKER_MODE_ENABLED = false` in `src/lib/echo-canceller.ts` hides
    the Settings section and forces `useSpeakerRecording().clean` false. The cleaning path is intact: after Stop
    in `use-transport.ts`, when `use-speaker-mode.ts` says so (`speakerModeApplies` in `audio-route.ts`: no
    headphones, not recording in silence). The raw take is kept as `.raw.wav`. The settings fields
    (`speakerMode`, `cleanupStrength`) are in `recording-settings-store.ts`, the UI in `settings-screen.tsx`
    (Speaker mode section, hidden). Design: `docs/decisions.md` (Speaker mode row; update it: un-shelved,
    Android, one setting) and `modules/echo-canceller/README.md`.
  - How the C core works (`cpp/echo_cancel.c`, plain C shared by both platforms): it mixes the reference from
    the plan (clip windows and click waves), finds the real echo delay, estimates one fixed speaker → room →
    mic filter per take (with a distortion model, `filter_ms` 85 by default) and subtracts it. Strong
    (`residual_suppression = 1`) adds per-frequency residual suppression and harder click suppression.
  - Knobs for "harder": `RESIDUAL = {frame 1024, share 0.1, spread 0, broadband 0, floor 0.2}` (lower the floor
    toward ~0.03, raise the share, spread and broadband above 0 for what a distorting speaker adds);
    `CLICKS_STRONG = {margin 3.0, floor 0.03}`; a longer `filter_ms`; more `ESTIMATE_ITERATIONS`. Expect the
    voice to turn dull or watery as the floors drop: finding that line is the tuning.
  - The user's report (2026-11-15): on iOS with Speaker mode on, the metronome and the other tracks are still
    audible in the take, though better than with it off.
  - Already tried and rejected in T21 (don't redo): the platforms' realtime voice processing (iOS voice
    processing I/O; Android's equivalent is the same kind of call-audio processing: thin, gated) and SpeexDSP's
    adaptive canceller (drifts while the performer plays).
  - Android testing is paused (top of Up next): build and compile it, keep its device checks for later. Do this
    ticket before T46 so the one fresh phone build has it.

### T46 — Device test pass

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Everything built since the last phone build runs on the user's iPhone: one fresh build with all the
  native changes since then, installed, and the **Device checks** list below gone through with the user.
- **Done when:**
  - [ ] A fresh iOS build with this checkout's fingerprint is on the user's iPhone: a preview build
        (`npm run build:preview`, then install from EAS/TestFlight) or a local dev build
        (`npm run ios:device -- <udid> --no-bundler`). Ask the user which; ask before anything that publishes
        or costs money (`release` skill).
  - [ ] Each **Device checks** line run with the user (they test, the agent guides, reads logs and fixes).
        Passing lines are deleted; small failures fixed in this session, bigger ones become tickets.
  - [ ] `node scripts/ota-check.mjs` says "OTA ok" for iOS afterwards, and the "Device testing deferred" note
        above is removed, so later sessions go back to a preview OTA update per ticket.
  - [ ] Milestone checks: `npx expo export --platform ios --platform android --output-dir /tmp/export`;
        Maestro (`npm run e2e`) only if it runs here (Native Instruments' NTKDaemon on port 5563 blocks it on
        this Mac; don't kill it, ask the user).
- **Context:** Android stays paused unless the user says otherwise: its lines stay in Device checks. Several
  lines need native code newer than some installed builds (local modules `audio-input`, `audio-export`, T7's
  background audio, T47's echo canceller); the iPhone dev build from 2026-11-15 already has part of it, so first check what's installed
  (`node scripts/ota-check.mjs` compares fingerprints with the latest preview build) before building. Local
  native builds need a UTF-8 locale for CocoaPods and `--no-bundler` when Metro already runs (AGENTS.md
  Gotchas). The `run-app` and `release` skills have the steps. The vertical timeline (T43) is worth trying on
  the phone too: it's off by default.

## Device checks

Run these with the next build on real phones (T7 needs one anyway, or before a release; see the `release`
skill). Fix or ticket what fails, then delete the line.

- Vertical timeline (T43; JS only, also fine in the simulator): Settings → Experimental → Vertical timeline on,
  open an idea. Not tried yet: drag along the ruler to scrub; tap an empty spot on the rail to add a section;
  move and resize a selected section; drag a clip to the bottom / right edge (auto-scroll); Record with
  pre-roll (dashed punch line across the lanes, notch on the ruler). Then how it feels: pinch, two-way pan,
  long-press pickup, the mixer row, 5+ tracks scrolled sideways. Switch off: the horizontal editor as before.
  Android (never run).

- Background & interruptions (T7, needs a new build; the iPhone dev build from 2026-11-15 has it, untested): arm a
  track in an idea with a take. Lock the screen ~30 s mid-take, unlock, Stop: the take is complete, lined up,
  full waveform. Same after switching to another app and back. A call (or FaceTime audio), Siri and a timer alarm
  mid-take: recording stops with the "Recording stopped…" note, the take up to there is saved, Play works after.
  Headphones and AirPods in/out mid-take: no crash, the take goes on. Siri during plain playback: it pauses, Play
  restarts normally. Android (never run; needs a build with `POST_NOTIFICATIONS`): the notification permission
  prompt on the first Record; the "Recording" notification with a timer and Stop while recording (Stop saves the
  take, with a note); lock screen mid-take; a call takes audio focus → stop and save; swiping the app away ends
  the recording (the take is lost, see Backlog).
- Idea header and settings sheet (T44), on the phone: tap "Idea 1 ⌄" → menu; Rename / Move to… / Export… /
  Delete work; Settings button → Idea | Recording; Recording → Input opens the picker over the sheet. Android
  (never run): the title shows as text + drop-down arrow and opens a Material dropdown; Settings is a `tune`
  icon button.
- Hear yourself (T39), needs a new build (`getInputInfo` latency in `audio-input`): Settings → Hear yourself is
  disabled on the speaker with the headphones note; with wired headphones it shows a small delay (~10 ms) and,
  once switched on, a track armed in an idea plays your voice in the headphones, stopped, playing and recording
  (a short gap when Record starts during playback). The feel: tight enough to sing along to? (tune
  `MAX_MONITOR_LATENCY_S` in `monitoring.ts`). AirPods: refused with the Bluetooth note, nothing heard. Unplug
  the headphones mid-take: no feedback burst from the speaker. Level slider changes the loudness. Listen to a
  take recorded with it on: only the mic, no doubled monitor signal. Playback doesn't glitch when the mic opens
  as Play starts with a track armed. Interface: input 2 chosen → you hear input 2 only, and the
  direct-monitoring note shows. Android (never run): live latency measurement only, Bluetooth refused.

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

- Recover a take cut off by the app being closed (from T7): swiping the app away mid-take (Android finalizes the
  WAV natively, `stopWithTask: true`), the system killing it, or a crash leaves a file in the cache that's never
  added to the idea. Persist the in-progress take's metadata at Record (take id, project, track, playback start,
  punch, route; `recordingRef` in `use-transport.ts`) in `@/lib/storage`; on the next launch, if the WAV is in the
  cache, offer to add it (alignment from the saved start without the measured latencies). An iOS WAV cut off
  without finalizing has a wrong header length: repair it from the file size (`wav.ts`).
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
- Vertical timeline polish (from T43, decide after trying it): m:ss ruler labels sit tight against the minor
  ticks in the 32 pt ruler (smaller font or a wider ruler when vertical; `rulerLabel` in `timeline.tsx`); the
  section notes glyph turns into "|||" in the rail (`section-rail.ts`); the lift shadow of a dragged lane or
  clip falls to the right instead of down; with 4+ tracks (74 pt lanes) longer track names truncate in the
  header row. Sizes are in `timeline-math.ts` (`GRIP_BAND`, `PILL_BAND`, `MIXER_ROW_HEIGHT`).
- Reorder drag: while a lifted lane passes over a track whose name pill hasn't slid away yet, that pill draws
  on top of the lifted lane for a moment (pills are RN views above the Skia canvas). Could hide or fade the
  passed pills, or draw the lifted pill above; only if it bothers on a device.

## Done

- T43 — Vertical timeline (experimental) — 2026-11-15 — Settings → Experimental → "Vertical timeline" (off by
  default, `experimental-settings-store.ts`) turns the same `Timeline` sideways: drawing and hit-testing stay in
  logical axes (`t` along time, `l` across), the Skia picture is transposed and touches swapped back
  (`logicalPoint`), ruler labels drawn upright and section names turned. Layout from `timelineLayout`
  (`timeline-math.ts`): rail + ruler down the left, `TrackColumn` becomes a header row (grip over the name pill;
  the mixer grows it down with M / S + volume), lanes share the width beside the "+" column (up to 4, then 74 pt
  each, scrolling sideways with ‹ / › chips). Status strip, transport and action bars unchanged. Simulator light
  - dark (play/follow, pinch, select, move, trim, pickup, seek, section tap, loop edge, reorder, mixer, mute, 6
    tracks, record); Android not run
- T7 — Background recording & interruptions — 2026-11-15 — a call, Siri, an alarm or another app taking audio
  stops the take and saves it up to there with a note; playback pauses; nothing auto-resumes (iOS would restart
  the recorder after a gap). Engine: `setInterruptionHandler`, interruptions observed only while playing or
  recording (Android audio focus), recorder errors reported, `stop()` falls back to the library's stashed file
  (`recording-result.ts`). Transport decides via `interruption.ts`. Android: "Recording" notification with timer +
  Stop (foreground service), notification permission asked on first Record (`POST_NOTIFICATIONS`),
  `androidFSStopWithTask: true` (swipe away = quit). Policy in `docs/decisions.md` (Interruptions). Not run on a
  device yet (deferred; Device checks)
- T44 — Settings within reach inside an idea — 2026-11-15 — the idea's "⋯" became a title menu ("Idea 1 ⌄":
  Rename, Favorite, Duplicate, Move to…, Export…, Delete; SwiftUI `Menu` in `idea-title-menu.tsx`, given an
  explicit frame because the native header gives a custom title no size) plus a Settings (sliders) header button
  → the settings sheet with Idea | Recording tabs (last tab remembered, `settings-sheet-store.ts`). Recording =
  Hear yourself, Input (new `input-picker` sheet), Output, Silent recording, Bluetooth mic, Latency, from the
  rows now shared with the Settings tab (`recording-settings-rows.tsx`). Name moved from Idea settings to
  Rename. Tab bar stays hidden in an idea. Simulator light + dark; Android not run
