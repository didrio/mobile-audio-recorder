# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T31 — Grid visibility & snap; pre-roll button in the transport · Sonnet · high effort · plan mode off

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
  section-label rail sits above the ruler. Thin status strip (time · metronome toggle (T17) · meter). Compact
  transport. "+ New Track" is a row after the last lane, not a header button.
- **Header of an idea**: Undo · Redo · "⋯" (Idea settings, Duplicate, Delete, Favorite). The menu has disabled
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

### T31 — Grid visibility & snap; pre-roll button in the transport

- **Status:** ready
- **Session:** Sonnet · high effort · plan mode off
- **Goal:** Separate seeing the grid from snapping to it, so people with a set tempo can still place clips
  freely, and quick-capture ideas aren't cluttered with bars nobody played to. Free the status strip by
  moving the pre-roll (lead-in) toggle down to the transport.
- **Done when:**
  - [ ] Pre-roll toggle moves to the transport row, right of Record, as a plain icon (same look as today's
        strip toggle, no circle). Back to start, Play and Record keep their exact positions (balance the row,
        e.g. an equal-width empty slot on the left). Still disabled while recording.
  - [ ] Every idea has a tempo and time signature (already true: 120, 4/4 by default). **Show grid** stays a
        per-idea setting in Idea settings (`grid` column). **Record new idea** creates the idea with the grid
        off; a blank idea from "+" creates it with the grid on (`createProject` option, both call sites in
        `projects-screen.tsx`).
  - [ ] New per-idea **Snap** toggle (migration: `projects.snap INTEGER NOT NULL DEFAULT 1`), in the status
        strip where pre-roll was (SF `square.grid.3x3`-like / Material `grid_on`, pick something clear).
        Saved, not an undo step (like pre-roll). With the grid hidden, Snap is disabled (nothing to snap to).
  - [ ] Snap off: clip drags/trims don't snap to grid lines (other clips' edges: decide, probably still snap),
        and the lane grid lines are drawn dotted/fainter (Ableton-style). Snap on: solid lines as today.
  - [ ] Duplicate copies `snap`. Unit tests (snap off passes `gridStep` 0) + screenshots of both line styles.
- **Context:** Discussed with the user at the end of T17: the app is a sketchpad, not a DAW, so the grid is
  off for quick capture but on for deliberately created ideas; a second strip button for show/hide was
  rejected because the strip is filling up (metronome T17, notes T24, keyboard T20) — show/hide stays in Idea
  settings. Metronome on still turns the grid on (`toggleMetronome` in `editor-store.ts`); it leaves Snap
  alone. Grid drawing and snapping are in `src/features/timeline/timeline.tsx` (`gridSnapStep` passed to
  `snapDrag` ~line 476; grid paths ~line 777, Skia paints) and `grid-math.ts` / `clip-edit-math.ts`. Strip
  and transport layout: `project-screen.tsx` (`StripToggle`, `TransportButton`, `styles.buttons`). Pre-roll
  wiring stays as is (`togglePreRoll`); with the metronome or grid on the run-up is whole bars
  (`use-transport.ts`).

### T26 — Loop region

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Simple looping: one loop region on the ruler, set in a tap, with gapless looped playback. Looping
  individual clips or sections and recording over a loop are parked for a rethink (Backlog).
- **Done when:**
  - [ ] A Loop toggle in the transport (SF `repeat`, Material `repeat`), saved per idea with the region
        (migration: `projects.loop_on`, `loop_start`, `loop_end`, nullable).
  - [ ] The region shows as a tinted band on the ruler with a handle at each end. Dragging a handle resizes the
        region (snaps to bars with the grid on, T9). Everything else on the ruler still scrubs the playhead, so
        the handles are hit-tested first. While Loop is on, the lanes inside the region get a light tint.
  - [ ] Turning Loop on with no region creates one: 8 s (or 2 bars with the grid on) from the playhead.
  - [ ] Playback with Loop on starts at the playhead if it's inside the region, otherwise at the region start.
        At the region end it wraps back without a gap or click (iterations scheduled ahead on the context
        clock). The playhead and clock wrap too.
  - [ ] Loop applies to playback only: Record ignores it for now (backing plays straight through).
  - [ ] Changing the region isn't an undo step (like the playhead). Unit tests cover the wrap/scheduling math.
- **Context:** `play()` and `PlayableClip` are in `audio-engine.ts`. The library's buffer-source
  `loop`/`loopStart`/`loopEnd` only loops one buffer, so multitrack looping means rescheduling every clip each
  iteration. The playhead anchor math is in `use-transport.ts` (`playbackAnchor`), and the ruler gesture is in
  `timeline.tsx`. The transport and status strip are getting crowded (pre-roll, notes, keyboard, metronome):
  check with a screenshot.

### T24 — Idea notes

- **Status:** ready (independent of the editor tickets)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Jot down what you played (unusual chords, tuning, capo, lyric ideas), so you can rebuild the song in
  a DAW weeks later. The user is a songwriter and this is a real, repeated pain for them.
- **Done when:**
  - [ ] A notes button in the status strip (SF `note.text`, Material `notes`) opens a sheet with a multiline
        text field. A dot on the button shows when the idea has notes. "Notes" is also in the "⋯" menu.
  - [ ] **Insert time** button: inserts the playhead time as `[1:23]` at the cursor. Outside editing, time stamps
        are tappable and seek to that time. This gives time-specific notes ("[0:45] chorus: Fmaj7 – Em7 –
        A7sus4") without needing section labels.
  - [ ] Migration: `projects.notes` (TEXT, default ''). Saved debounced and on close. Not an undo step (the text
        field has its own undo).
  - [ ] Duplicate (`duplicateProject` in `projects-repo.ts`, T10) copies the notes: add the column to its INSERT.
  - [ ] Unit tests for finding and inserting time stamps.
- **Context:** Decided with the user: idea-wide notes first, because they work without sections and add almost
  no UI. Per-section notes are part of T18, and first-class chord progressions are in Backlog. The status strip
  and menu items are in `project-screen.tsx` and `src/features/project/idea-menu-items.ts`. Time formatting is
  in `src/features/audio/format-time.ts`. A later Search (T10/T19) could match notes too.

### T20 — Pitch reference keyboard

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** A quick piano to find and hear any note (starting note for a melody, checking a key) without
  leaving the idea.
- **Done when:**
  - [ ] A keyboard button in the status strip (SF `pianokeys`, Material `piano`) opens a short sheet. The
        timeline stays visible, so you can play along with playback.
  - [ ] Two octaves on screen (one in a narrow portrait sheet if two get too small), octave down/up buttons,
        multi-touch, note name shown while held (C4, F♯3…). The note sounds while held and releases smoothly.
  - [ ] The sound is synthesized in code (`createOscillator`, triangle or a few mixed partials with an
        attack/release envelope), so no sample files ship with the app. Latency feels instant on a device.
  - [ ] It is a reference tool only: never recorded into takes (other than what the mic hears), not on the
        timeline. Volume follows a "Keyboard volume" setting.
  - [ ] Unit tests for note ↔ frequency and note names.
- **Context:** `react-native-audio-api` has `createOscillator` (see `lib/typescript/module/jsi-interfaces.d.ts`).
  Play it through the same `AudioContext` as playback in `audio-engine.ts` so it works during playback.
  Product rule: no software instruments. This stays a pitch reference, so don't grow it into a recordable
  instrument. A mic tuner is the natural companion (Backlog).

### T18 — Section labels

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Mark the song's structure (Intro, Verse, Chorus…) on a colored rail above the ruler, and jump to
  sections with a tap.
- **Done when:**
  - [ ] `sections` table (migration): id, project_id, name, color, start, duration.
  - [ ] Rail above the ruler, about the ruler's height. It starts after the controls column, scrolls and zooms
        with time, and doesn't scroll vertically with the tracks.
  - [ ] Tapping an empty spot on the rail opens a picker: presets with fixed colors (Intro, Verse, Pre-chorus,
        Chorus, Bridge, Outro) and Custom… (name + a color from a palette). A new section starts at the tapped
        spot and runs to the next section, or 8 bars (grid on) / 15 s (grid off).
  - [ ] Agreed interaction model: tapping a section jumps the playhead to its start and selects it (action bar:
        Rename, Color, Delete). Drag a selected section to move it, drag its handles to resize it,
        long-press to pick one up. Sections never overlap (they stop at their neighbors) and snap to bars when
        the grid is on.
  - [ ] Undoable (editor store). Names truncate when the section is narrow.
  - [ ] The section action bar also gets **Notes**: an optional free-text note per section (chords, lyric cue),
        stored in `sections.notes`, with a small icon on the section when one is set. Complements T24's idea
        notes.
  - [ ] Palette colors are tokens in `src/theme/tokens.ts` (light and dark), readable label text on each.
- **Context:** Reuse T5's selection and drag code: the math in `clip-edit-math.ts` is generic (items with
  start/duration on a row; `grabPart`, `dragWindow`, `snapDrag`), the gestures in `timeline.tsx` (one pan that
  decides on touch-down, a long-press pan beside it, `owner` says who holds the item; the drop draws from the
  drag state until the saved edit renders). Sections have no source window: give `dragWindow` offset 0 and an
  unbounded source, and stop them at their neighbors. `snapDrag` already takes a `gridStep` (T9: `gridSnapStep(meter, zoom)` in
  `grid-math.ts`, 0 = grid off), so sections snap to bars by passing a bar-length step. Selection must be a shared value read by the picture
  (`selection`): values that only reach the picture through its closure redraw a frame or more late. Draw the
  rail in the same per-frame Skia picture as the ruler.

### T16 — Clip options

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Per-clip adjustments from the clip action bar's "Options…".
- **Done when:**
  - [ ] Options… opens a sheet for that clip: Gain (dB slider, double-tap to reset), Fade in and Fade out
        (length), Restore full take (reset the trim to the whole take, where it fits), Delete.
  - [ ] Migration: `clips.gain` (1), `fade_in` (0), `fade_out` (0). The engine applies gain and fades with
        gain ramps, plus a few-millisecond automatic declick fade on every clip edge.
  - [ ] Waveform drawing reflects clip gain. Changes are undoable (editor store).
- **Context:** Add "Options…" to `clip-action-bar.tsx` (and an `onOptions` to `ClipEditing` in `timeline.tsx`,
  wired in `project-screen.tsx`). Clips play through one `GainNode` per track (`play()` in `audio-engine.ts`), so clip gain and
  fades need a per-clip `GainNode` between the source and its track gain (add `gain`/fades to `PlayableClip`).

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
- **Context:** The Ideas stack is `src/app/(tabs)/(home)/`. `deleteProject` deletes rows + files; T10's list code (`ideas-list.ts` sort/filter, `idea-row.tsx`, `idea-actions.ts`, `rename-idea-dialog.tsx`) is meant to be reused for a folder's contents; deleting a
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

### T21 — Speaker mode (echo cancellation)

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Overdub without headphones: while recording, cancel the app's own output (backing tracks,
  metronome, keyboard) from the mic, so the user hears the song from the speaker and the new take stays
  clean enough for a sketch.
- **Done when:**
  - [ ] Spike first, on real phones: record singing and an acoustic guitar over a backing track from the
        speaker, with and without echo cancellation. Note how much bleed is left, and whether sustained notes,
        quiet passages or dynamics get eaten. Write the findings in this ticket and decide with the user if
        it's worth shipping.
  - [ ] "Speaker mode" toggle in Settings → Recording, off by default. When recording starts with no headphones
        connected and the mode is off, offer it once (dismissable).
  - [ ] On: the recorder uses `iosVoiceProcessing: true` (iOS) and `androidInputPreset: 'voiceCommunication'`
        (Android). Headphones connected → raw mic as today.
  - [ ] Latency compensation stays right in both modes: voice processing adds its own delay, so measure it
        and keep a separate latency offset per mode (Settings → Recording).
  - [ ] Playback volume while recording in speaker mode is checked (iOS voice processing can duck other
        output); the mode is turned off again after recording so normal playback sounds as before.
- **Context:** Both options are in `AudioRecorderOptions` of `react-native-audio-api`
  (`lib/typescript/module/types.d.ts`); no native code needed. Expectations to set with the user: the
  platforms' echo cancellation is tuned for speech calls. It works well for humming or singing a melody, but
  it can thin out music (noise suppression, auto gain, mono), and some bleed remains. So this is a
  convenience for quick sketches; headphones stay best for keeper takes. Recording start and latency code:
  `use-transport.ts`, `take-alignment.ts`, `recording-settings-store.ts`.

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
- Android: the old "Idea 1" clip drew without a waveform on the emulator (missing take file or peaks?).

## Backlog

Ideas that aren't ready to work on yet. Promote them to "Up next" with full detail when they are.

- Loop recording & takes, to rethink with the user after the current Up next list: singing over a loop again
  and again, keeping passes as alternate takes (badge + picker), comping one take from several passes, looping
  a clip or section directly, a punch-out end point. Clips are already windows onto immutable takes (`db.ts`),
  so alternates need no new files.
- Export & share (deferred): mixdown via `OfflineAudioContext` + a JS WAV encoder, shared with `expo-sharing`;
  consider per-track stems from 0:00 for rebuilding in a DAW. Must match playback (track volume/mute/solo via
  `trackOutputGain` in `mixer.ts`, clip gain/fades from T16) and leave out the metronome and keyboard.
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
- Tuner: show the pitch the mic hears (note + cents), next to T20's keyboard.
- Pitched, not agreed yet (recording-focused tools, not DAW features):
  - Flag button while playing or recording: drops a `[1:23] ★` time stamp into the idea's notes (T24) to mark
    "that part was good".
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

- T17 — Metronome & count-in — 2026-11-14 — clicks synthesized in code (`metronome.ts`, accented downbeat, 6/8
  and 12/8 groups) scheduled on the context clock with playback and recording (lookahead scheduler in the
  engine, also before 0:00 so pre-roll is the count-in, whole bars with the metronome on); strip toggle (saved,
  turns the grid on) and volume slider in Idea settings (undoable), migration v5. Device clap check pending
- T9 — Idea settings, tempo & grid — 2026-11-14 — "Idea settings" sheet from the "⋯" menu (name, BPM with ±, typed
  value and Tap tempo, time signature 2/4…12/8, Grid switch; undoable, migration v4), grid lines + bar numbers on
  the ruler (beat lines fade when zoomed out), clips snap to grid lines, pre-roll is 1 or 2 bars with the grid on
- T10 — Ideas library basics — 2026-11-14 — "+" menu (New Idea without recording), swipe/long-press Rename,
  Duplicate (copies take files), Delete with confirmation, also in the idea's "⋯"; date under each idea, sort
  (Recent/Name/Date created, remembered), header search, recordings storage in Settings
- T5 — Clip editing — 2026-11-14 — tap selects (handles + Split/Duplicate/Delete bar), drag moves across tracks
  and trims (back out to the take), long-press picks up, snaps to clip edges/playhead/0:00, drops replace what's
  under them, one undo step each; edits while playing restart playback; tap no longer fires on swipes (T30);
  `/wrap` now publishes a preview OTA (`scripts/ota-check.mjs`)
- T25 — Pre-roll (punch in at the playhead) — 2026-11-13 — pre-roll toggle per idea (migration v3), 1/2/4 s
  length in Settings, run-up plays every track and cuts the armed one at the punch (`cutTrackAt`), dashed punch
  marker, stop in the run-up saves nothing, Record while playing punches in on the fly; clap test is in Device
  checks

- Reorder stripes (no ticket) — 2026-11-13 — during a track drag, lanes and column cells take the stripe of
  the slot they're heading to (`laneSlotDuringDrag`, `drag.target`), so rows keep alternating; fresh preview
  builds of 11db62a + this fix as a preview OTA
- Transport check (no ticket) — 2026-11-13 — Back to start keeps playing and always reveals 0:00
  (`revealPlayhead`), recording clock shows the timeline position; kept Stop → take start; record-while-playing
  added to T25
