# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** none queued. Try T48 on the phone, then promote a Backlog item or add tickets with `/ticket`.

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
- **Vertical timeline** (T43, experimental, Settings → Experimental): the same `Timeline` turned sideways, so
  every timeline change must keep working in both. Draw and hit-test in the logical axes (`t` along time, `l`
  across: rail, ruler, lanes), never raw x/y: the picture is transposed in vertical and touches go through
  `pointOf`; text is the exception (`rulerLabel`, the rail's `text`). Sizes come from `timelineLayout` in
  `timeline-math.ts`; `TrackColumn`, `LaneOverlay` and `useReorderStyle` branch on `vertical`.

## Device checks

What's left after T46's iPhone pass: Android (when it's back), wired headphones and a USB interface (when at
hand), a fresh install. Run them then or before a release (`release` skill). Fix or ticket what fails, then
delete the line.

- Speaker mode (T47) on Android (never run; the JNI path is only compiled; passed on the iPhone in T46: claps
  kept and lined up, backing and click gone, voice and guitar clean): Settings → Experimental → Speaker mode
  on, no headphones, an idea with a track and the metronome clicking; clap test, guitar and voice, time the
  cleaning on a 2–3 minute take (much over ~15 s → `filter_ms` 300 → 200). Tuning order if dull/watery: module
  README. iPhone, with wired headphones: the take is untouched (no
  `.raw.wav` beside it).

- Vertical timeline (T43) on Android (never run; passed on the iPhone in T46): Settings → Experimental →
  Vertical timeline on, open an idea; scrub, sections, clip drag with auto-scroll, Record with pre-roll, pinch and
  two-way pan, the mixer row.

- Background & interruptions (T7) on Android (never run; passed on the iPhone in T46; needs a build with
  `POST_NOTIFICATIONS`): the notification permission prompt on the first Record; the "Recording" notification with
  a timer and Stop while recording (Stop saves the take, with a note); lock screen mid-take; a call takes audio
  focus → stop and save; swiping the app away ends the recording (the take is lost, see Backlog).
- Idea header and settings sheet (T44) on Android (never run; passed on the iPhone in T46): the title shows as
  text + drop-down arrow and opens a Material dropdown; Settings is a `tune` icon button.
- Hear yourself (T39), wired headphones (the speaker and AirPods refusals passed on the iPhone in T46): it shows
  a small delay (~10 ms) and, once switched on, a track armed in an idea plays your voice in the headphones,
  stopped, playing and recording (a short gap when Record starts during playback). The feel: tight enough to sing
  along to? (tune `MAX_MONITOR_LATENCY_S` in `monitoring.ts`). Unplug the headphones mid-take: no feedback burst
  from the speaker. Level slider changes the loudness. Listen to a take recorded with it on: only the mic, no
  doubled monitor signal. Playback doesn't glitch when the mic opens as Play starts with a track armed.
  Interface: input 2 chosen → you hear input 2 only, and the direct-monitoring note shows. Android (never run):
  live latency measurement only, Bluetooth refused.
- Inputs & outputs (T38), wired and USB (the built-in mic, AirPods, route button, Bluetooth and speaker latency,
  clip meter, input gain and 16-bit takes passed on the iPhone in T46): Settings → Recording → Input lists a
  wired headset and a USB interface; picking the interface sticks after unplug/replug (Automatic records while
  it's out, also mid-take: the take keeps going). Two-input interface: guitar in input 2, Channel "Input 2" → the
  take has the guitar at full level and nothing from input 1; the meter follows input 2. Latency clap test for
  wired and USB. Android (never run): the input list, Output name by priority, channel extraction in Kotlin.
- Export (T36/T37) on Android (never run; the Kotlin module only compiled; passed on the iPhone in T46): M4A
  (MediaCodec) plays, the chooser for one and several files, the select-mode bar with three actions.

- Recently Deleted (T41) on Android (passed on the iPhone in T46): the screen's Select / Select All header and
  the long-press sheet. The 30-day purge was only unit-tested.
- Ideas folders (T19) on Android: the long-press menu bottom sheet (`useActionMenu`), the select-mode bar at the
  bottom of the screen, header Select / Sort / "+" and the Select All / Done header in select mode.
- Android preview APK installs; an OTA update (`npm run update:preview`) published after the builds arrives on
  both phones (Settings → Update shows an update ID after two cold starts).
- Recording: mic permission prompt on a fresh install.
- Overdub with wired headphones (Bluetooth passed on the iPhone in T46): record a clap against an existing take,
  they line up; if not, tune Settings → Recording → Latency offset for that route.
- Idea settings & grid (T9) on Android (passed on the iPhone in T46): the sheet (formSheet, Switch, number-pad
  keyboard over the BPM field).
- Ideas list (T10) on Android (passed on the iPhone in T46): header Sort/Add dropdowns (Compose, never run),
  long-press alert.
- Snap & grid (T31) on Android (passed on the iPhone in T46): the Snap and pre-roll icons.
- Android: the old "Idea 1" clip drew without a waveform on the emulator (missing take file or peaks?).

- Quick listen (T48) on the iPhone: Play from the Ideas list sounds like the editor's Play (levels, mute / solo);
  scrubber follows and seeks by tap and drag without triggering the row's swipe actions; opening an idea, a tab
  switch, locking the phone, or a call stops it; works in folders, Favorites and search results.

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

- T48 — Quick listen from the Ideas list — 2026-11-15 — a Play / Stop button on idea rows (not in select mode or
  on empty ideas) plays the idea from 0:00 like the editor's Play (clips, gain, fades, track volume, mute / solo;
  no metronome, no loop), with a scrubber under the row (follows the audio, tap or drag to seek). State in
  `quick-listen.ts`; stops on blur / tab switch / background / select mode / delete / interruption
  (`use-quick-listen-guards.ts`); `playableClips` moved to `audio/playable-clips.ts`. Simulator dark + light, no
  sound; sound, drag-seek vs. the row's swipe actions and interruptions need the phone (Device checks)

- T46 — Device test pass — 2026-11-15 — fresh dev build (local) and preview build (EAS, iOS) on the iPhone Air;
  every iPhone line runnable with AirPods + guitar passed (Speaker mode, Silent recording, meter, Visual
  metronome, background & interruptions, Bluetooth routing and latency, metronome, punch-in, loop, clip options,
  keyboard, mixer, editor feel incl. the vertical timeline, notes, header, lists, Recently Deleted, export, icons),
  nothing to fix. Device checks now hold only Android, wired-headphone, USB-interface and fresh-install lines.
  Preview OTA per ticket is back (`ota-check`: iOS OK). Maestro not run (NTKDaemon); export both platforms OK

- T47 — Speaker mode on Android, one strong setting — 2026-11-15 — Speaker mode is back as one switch in Settings
  → Experimental (`experimental-settings-store.ts`; recording settings v3 drop `speakerMode` / `cleanupStrength`),
  always the most aggressive cleanup: tuning moved into `ec_options`, the desktop test got a "realistic" phone
  (limiter, long room tail, moving performer) and env knobs; defaults (300 ms filter, residual margin 1 / spread 1
  / broadband 0.05 / floor 0.03, clicks 5 / 0.01) remove 44 dB of backing and 45 dB of clicks there vs 22 / 22
  for the old Strong (sweep in the module README). Android: CMake + JNI + Kotlin `EchoCancellerModule`, app
  builds. iOS cleaning seen in the simulator; no phone yet (Device checks), Android not run

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
