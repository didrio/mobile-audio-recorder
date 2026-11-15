# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T45 — Settings where they're used · Sonnet · low effort · plan mode off

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

### T45 — Settings where they're used

- **Status:** ready
- **Session:** Sonnet · low effort · plan mode off
- **Goal:** The last two app settings you'd change while working in an idea sit where you use them, not only in
  the Settings tab (follow-up to T44's "put each setting where it's used").
- **Done when:**
  - [ ] The pitch keyboard sheet (`src/features/keyboard/pitch-keyboard-sheet.tsx`) has its own volume slider,
        the same `useKeyboardSettingsStore` value as Settings → Pitch keyboard (one store, so they always agree).
        Reuse `VolumeSlider` + `formatDb` like `settings-screen.tsx` (drag shows live, saved on release).
  - [ ] Long-pressing the Pre-roll button above the transport (`preRollToggle` in
        `src/features/project/project-screen.tsx`, a `StripToggle`) offers the pre-roll length: seconds when the
        idea's grid is off (`PRE_ROLL_SECONDS_OPTIONS`), bars when it's on (`PRE_ROLL_BARS_OPTIONS`), checkmark on
        the current one; tap still toggles. iOS: a native menu (the `@expo/ui` SwiftUI `Menu` with
        `onPrimaryAction` = tap toggles, long-press = menu, like `idea-title-menu.tsx`) or `useActionMenu`
        (`src/components/action-menu.tsx`); pick what looks native in a screenshot. Settings → Pre-roll stays.
  - [ ] Tests for both (keyboard sheet test, project-screen test), `npm run check`, simulator light + dark.
- **Context:** Agreed with the user in T44. Keep the Settings tab rows; these are extra entry points to the same
  stores (`recording-settings-store.ts`, `keyboard-settings-store.ts`). Watch the SwiftUI-in-RN sizing gotcha
  from T44: a SwiftUI `Host` placed in a native header needs an explicit size.

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

### T43 — Vertical timeline (experimental)

- **Status:** ready
- **Session:** Opus · extra high effort · plan mode on
- **Goal:** An experimental Settings toggle that turns the idea editor vertical: time runs top→bottom, tracks
  are side-by-side columns, the playhead moves down. All behavior stays the same. It's there to try out and
  tweak, not to replace the horizontal editor.
- **Done when:**
  - [ ] Settings → new "Experimental" section → "Vertical timeline" switch (off by default, persisted). Opening
        an idea uses the chosen layout. The horizontal editor is unchanged when it's off.
  - [ ] Layout: ruler and section rail run down the left edge. Track header (grab handle + name pill, arm, M/S
        badges) sits in a row along the top. Up to 4 lanes fill the width. With more tracks, lanes scroll
        sideways, with the floating "N tracks ←/→" indicators (today's above/below ones turned sideways).
        "+ New Track" is a column after the last lane.
  - [ ] Clips, waveforms (drawn along the vertical time axis), grid, sections, loop region, punch notch, live
        recording take and playhead all draw rotated. Follow-playhead scrolls down. Pinch zooms time
        vertically.
  - [ ] The interaction model works the same along the new axes: tap select, drag/trim/resize, long-press
        pickup, tap empty space or ruler to seek, section labels, loop edges, snap, auto-scroll at the
        edges, long-press reorder of tracks (now left/right). Undo/redo is unaffected (it's the same edits).
  - [ ] Mixer, action bars, status strip and transport have a decided vertical placement (UI calls below),
        reviewed with the user from simulator screenshots. Light + dark.
  - [ ] Unit tests for the axis-swapped math. Existing timeline tests still pass.
- **Context:** Tried early on and found confusing for first-time users. Now that most features exist, the
  user wants it as a toggle to find a version that works. Most ideas have 2–3 tracks (instrument + vocal,
  maybe bass or a backing vocal), so 4 columns covers the usual case and shows about twice the time.
  - Code: `src/features/timeline/timeline.tsx` (~1.9k lines: Skia drawing + all gestures),
    `timeline-math.ts` (`timeToPoint`/`pointToTime`, `LANE_HEIGHT`, `hiddenLanes`/`pageScroll` for the
    off-screen indicators), `lane-overlay.tsx` (name pills, indicators, New Track row), `track-column.tsx`
    (handles, mixer, reorder), `clip-edit-math.ts` / `section-math.ts` / `reorder-math.ts` / `grid-math.ts`
    (hit-testing in 1-D time + lane index, mostly axis-agnostic already). Screen composition is in
    `src/features/project/project-screen.tsx`.
  - Approach to weigh in plan mode: put one orientation/axis mapping (time axis ↔ lane axis → x/y) in the
    timeline and route drawing and hit-testing through it. Don't fork `timeline.tsx` into a second copy that
    drifts. If the refactor alone is a session, split: (a) axis refactor + vertical drawing/playback/scroll,
    (b) vertical gestures + editing.
  - Setting: a small persisted zustand store like `src/features/settings/recording-settings-store.ts`
    (`zustandStorage`), shown in `settings-screen.tsx` (Speaker mode's "(experimental)" row is the
    precedent).
  - UI calls to make (and show the user): lane width with 1–3 tracks (fill the width, or stay at ¼ and leave
    room?); where the mixer opens (a row expanding down under the header vs. a sheet); clip/section action bar
    position (beside the item instead of above); ruler label format in a narrow column; whether the status
    strip and transport stay as they are.
  - Portrait only, as everywhere. Check Android's opaque header padding (Gotchas) if the header row changes.

## Device checks

Run these with the next build on real phones (T7 needs one anyway, or before a release; see the `release`
skill). Fix or ticket what fails, then delete the line.

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

- T44 — Settings within reach inside an idea — 2026-11-15 — the idea's "⋯" became a title menu ("Idea 1 ⌄":
  Rename, Favorite, Duplicate, Move to…, Export…, Delete; SwiftUI `Menu` in `idea-title-menu.tsx`, given an
  explicit frame because the native header gives a custom title no size) plus a Settings (sliders) header button
  → the settings sheet with Idea | Recording tabs (last tab remembered, `settings-sheet-store.ts`). Recording =
  Hear yourself, Input (new `input-picker` sheet), Output, Silent recording, Bluetooth mic, Latency, from the
  rows now shared with the Settings tab (`recording-settings-rows.tsx`). Name moved from Idea settings to
  Rename. Tab bar stays hidden in an idea. Simulator light + dark; Android not run
- T39 — Hear yourself — 2026-11-15 — input monitoring in Settings → Hear yourself (switch, level up to +6 dB,
  delay, direct-monitoring note; the user's call: no editor UI until T44): `recorder.connect()` →
  `RecorderAdapterNode` → chosen channel → own gain → destination (`setMonitor` in `audio-engine.ts`,
  reconnected around every recorder stop/start: the library drops the adapter on stop and the next start fails).
  Offered only on headphones/interface with ≤ 30 ms round trip (`monitoring.ts`; estimate from the new
  `getInputInfo` latency on iOS, live measurement in `use-monitoring.ts`; Bluetooth refused). The mic now stays
  open while playing with a track armed (meter too). `ListRow` accessories sit at the trailing edge. Needs a new
  build; on-device checks are in Device checks.
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
