# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T25 — Pre-roll (punch in at the playhead) · Opus · high effort · plan mode on

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
  `project-screen.tsx`, Android `@expo/ui` Compose dropdown in `android-idea-menu.android.tsx`. Enable an item
  by giving it an action there.
- **Undo/redo** covers every edit, in memory per open idea (100 steps), cleared when leaving the idea. A new
  edit is a pure builder in `src/features/project/edit-commands.ts` returning an `Edit` (before/after snapshots
  of the rows it touches, `edit-changes.ts`), applied with `executeEdit()` from `editor-store.ts`. One gesture =
  one `executeEdit` at its end (live values during a drag go through shared values). A new table (sections,
  idea settings) needs a `Change` variant, `applyToProject` and `saveChanges` support.
- **Arming**: a toggle, one armed track at a time (multi-arm deferred to Backlog: one phone mic would only
  record the same audio onto each track). Nothing armed → Record grayed out.
- **Ideas list**: sort options (no manual drag ordering), folders with unlimited depth, Favorites as a virtual
  folder.

### T25 — Pre-roll (punch in at the playhead)

- **Status:** ready (T17 builds its count-in on it)
- **Session:** Opus · high effort · plan mode on
- **Goal:** Record into an exact spot with a run-up: playback starts a little before the playhead, including
  the armed track's own audio, and recording kicks in exactly at the playhead ("so you can anticipate what's
  coming", the user's request).
- **Done when:**
  - [ ] A pre-roll toggle in the status strip (SF `arrow.right.to.line`, Material `start`), saved per idea
        (migration). Its length lives in Settings → Recording: 1 s / 2 s / 4 s while the grid is off, 1 or 2 bars
        while the grid is on (T9). Defaults: 2 s and 1 bar.
  - [ ] Pre-roll on + Record: playback of **every** track, the armed one included, starts at playhead − pre-roll
        (clamped at 0, padded with silence before 0:00). At the playhead the armed track's existing audio goes
        silent and the new take starts there, replacing what's under it as recording does now (`clearRange`).
        After Stop the playhead returns to the punch point, as today.
  - [ ] Punch accuracy: the take's first sample is at the playhead after latency compensation. Preferred: start
        the recorder at the start of the pre-roll and place the clip with `offset` = pre-roll length. That avoids
        recorder start-up delay at the punch point, and T5's trim can later extend back into the run-up. Check
        that this is right in `take-alignment.ts` and test it with a clap on a device.
  - [ ] The status strip clock and the playhead show the run-up (moving toward the punch point), plus a
        visible marker at the punch point while pre-rolling. Stop during the run-up cancels without saving a
        take.
  - [ ] Pre-roll off → recording behaves exactly as today.
  - [ ] Record while playing punches in on the fly at the current position, as in most DAWs (Record is
        disabled during playback today). The armed track's own audio is cut at the punch point, with no gap
        while the recorder restarts: the same machinery as the pre-roll's punch, with the run-up already playing.
  - [ ] Unit tests for the timing math (run-up start, clamping at 0, clip offset).
- **Context:** Recording start, playback during overdub and latency compensation are in
  `src/features/project/use-transport.ts` (`record`) and `src/features/audio/take-alignment.ts`; scheduling is
  in `audio-engine.ts` (`play()`). The armed track has to play during the run-up and be cut at the punch point:
  schedule its clips to end there, or ramp its track gain to 0 (`setTrackGain`). T17's count-in becomes this
  pre-roll plus clicks. A punch-out end point belongs to the loop-recording rethink (Backlog).

### T5 — Clip editing

- **Status:** ready
- **Session:** Opus · high effort · plan mode on
- **Goal:** Move, trim, split, duplicate and delete clips on the timeline, all undoable.
- **Done when:**
  - [ ] The agreed interaction model (top of Up next): tapping a clip selects it, with edge handles and an action
        bar (Split, Duplicate, Delete, Options…; Options… stays hidden until T16). Dragging a selected clip
        moves it in time and between tracks. Handles trim (`offset`/`duration`, never the file), and can
        extend back out to the take's bounds. Long-pressing an unselected clip picks it up. Tapping a clip
        never seeks.
  - [ ] Split at the playhead creates two clips on the same take. Duplicate places the copy right after the
        original on the same track. Delete.
  - [ ] Snap to other clip edges and the playhead (grid snapping comes with T9).
  - [ ] Dropping a clip onto others replaces what's under it, as recording does (`clearRange`); undo restores
        the trimmed clips.
  - [ ] Every edit is an editor-store command (one undo step per gesture).
  - [ ] Unit tests for the pure edit operations (move/trim/split math).
- **Context:** Gestures in `timeline.tsx` (pan = scroll, pan starting on the ruler = drag the playhead, pinch
  = zoom, tap = seek). A tap needs hit-testing: clip → select, empty lane space → seek. Waveform paths are
  cached per clip window (`waveform-path.ts`), so a trim just asks for a new window. Selection and handles are
  drawn in the per-frame picture, driven by shared values. Moving a clip between tracks only changes its
  `trackId`. Edits: builders in `edit-commands.ts` (see `recordTakeEdit` for `clearRange` → changes) and
  `executeEdit`; history and write-through come for free. T18 reuses this selection and drag code for section
  labels, so keep it generic (an item with start/duration on a row). Long-press pickup: reuse the track reorder
  pattern (`track-column.tsx`: pan with `activateAfterLongPress`, an immediate press highlight that fills over
  the hold, medium haptic + lift on activate; lift look and order-safe drag state in `use-reorder-style.ts`).

### T10 — Ideas library basics

- **Status:** ready (independent of the editor tickets)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Manage ideas: create without recording, rename, duplicate, delete, sort, find.
- **Done when:**
  - [ ] "+" in the Ideas tab header (iOS toolbar menu; Android `headerRight`) with "New Idea" (T19 adds "New
        Folder"). It creates an idea with Track 1 (armed) and opens it **without** recording. The "Record new
        idea" hero stays as it is.
  - [ ] Rename, duplicate ("<name> copy": copies the rows and the take files, so deleting one idea never
        affects the other) and delete with confirmation. Available from swipe actions and the long-press
        context menu on rows. Duplicate and Delete are also in the idea's "⋯" header menu. Rename there
        lives in Idea settings (T9).
  - [ ] Date under each idea. Sort menu: Recent (default), Name, Date created (remember the choice in
        `@/lib/storage`). Search in the header.
  - [ ] Storage used by recordings shown in Settings.
- **Context:** `deleteProject` (rows + files) and `useDeleteProject` (also clears decoded buffers) already exist
  in `src/features/projects/` but have no UI yet. Names default to "Idea N" (`createProject`). The list is
  `src/features/projects/projects-screen.tsx`. T19 adds folders on top of this screen, so keep the row and
  sort code reusable for a folder's contents.

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
  - [ ] Duplicate (T10) copies the notes.
  - [ ] Unit tests for finding and inserting time stamps.
- **Context:** Decided with the user: idea-wide notes first, because they work without sections and add almost
  no UI. Per-section notes are part of T18, and first-class chord progressions are in Backlog. The status strip
  and menu items are in `project-screen.tsx` and `src/features/project/idea-menu-items.ts`. Time formatting is
  in `src/features/audio/format-time.ts`. A later Search (T10/T19) could match notes too.

### T9 — Idea settings, tempo & grid

- **Status:** ready (snapping needs T5)
- **Session:** Sonnet · high effort · plan mode off
- **Goal:** Each idea has a settings sheet with its name, tempo and time signature, and an optional bar/beat
  grid on the timeline.
- **Done when:**
  - [ ] "Idea settings" in the idea's "⋯" menu opens a sheet: Name (rename), Tempo (BPM 40–240, stepper or
        field, plus a Tap tempo button), Time signature (2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 12/8), and a Grid
        toggle. A footer note says that changing the tempo moves only the grid, not the audio.
  - [ ] Migration: `projects.bpm` (default 120), `beats_per_bar` (4), `beat_unit` (4), `grid` (off). Setting
        a tempo turns the grid on.
  - [ ] Grid on: bar and beat lines in the lanes (beat lines fade out when zoomed far out), bar numbers on the
        ruler instead of mm:ss, snap to grid while editing clips (extends T5's snapping). The clock in the
        status strip stays in time.
  - [ ] Settings changes are editor-store commands (undoable).
- **Context:** Grid lines go in the timeline picture next to the ruler ticks (`rulerSteps` in
  `timeline-math.ts`). Compound meters (6/8, 12/8): beats are eighths, grouped in threes. T17 adds the
  metronome section to this sheet. Quantize stays in Backlog.

### T17 — Metronome & count-in

- **Status:** ready (after T9 and T25)
- **Session:** Opus · high effort · plan mode on
- **Goal:** A metronome that follows the idea's tempo and time signature, with a count-in for recording.
- **Done when:**
  - [ ] Click generated in code (short buffers scheduled on the context clock — not an instrument), with an
        accented downbeat. 6/8 and 12/8 accent each group of three eighths, the bar's first more strongly.
  - [ ] Metronome on/off toggle in the status strip, saved per idea. Metronome volume in Idea settings
        (migration).
  - [ ] Clicks during playback and recording, never recorded into takes (with headphones). The click lines up
        with takes after latency compensation (record a clap on the click on a device and check).
  - [ ] Count-in is T25's pre-roll with clicks: with the metronome on, the run-up clicks (whole bars, so the
        punch lands on the beat as counted). No separate count-in toggle. The take starts at the playhead, not
        before.
- **Context:** Scheduling and playback helpers live in `audio-engine.ts`. Recording start and latency
  compensation: `take-alignment.ts` and `use-transport.ts`. Turning the metronome on also turns the grid on.

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

- **Status:** ready (after T5 and T9)
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
- **Context:** Reuse T5's selection and drag code. Draw the rail in the same per-frame Skia picture as the
  ruler.

### T16 — Clip options

- **Status:** ready (after T5)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Per-clip adjustments from the clip action bar's "Options…".
- **Done when:**
  - [ ] Options… opens a sheet for that clip: Gain (dB slider, double-tap to reset), Fade in and Fade out
        (length), Restore full take (reset the trim to the whole take, where it fits), Delete.
  - [ ] Migration: `clips.gain` (1), `fade_in` (0), `fade_out` (0). The engine applies gain and fades with
        gain ramps, plus a few-millisecond automatic declick fade on every clip edge.
  - [ ] Waveform drawing reflects clip gain. Changes are undoable (editor store).
- **Context:** Clips play through one `GainNode` per track (`play()` in `audio-engine.ts`), so clip gain and
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
- **Context:** The Ideas stack is `src/app/(tabs)/(home)/`. `deleteProject` deletes rows + files; deleting a
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

- **Status:** ready (after T17)
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
- Mixer: drag a volume while playing (smooth, no clicks), mute/solo during playback and during an overdub
  (backing changes, the take doesn't).
- Reorder: grip lights up at once, haptic after the hold, other lanes glide, auto-scroll near the edges with
  many tracks, no jump on drop; also check light mode.
- Timeline: pinch-zoom and pan momentum, tap-to-seek, dragging the playhead on the ruler, playhead vs. audio
  sync, smooth playback on a 3-minute idea with several takes.
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
- Quantize clips to the tempo grid (after T9).
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
- T30 — Possible swipe-seeks bug (unverified): in one Maestro run on the iOS simulator, a second lane swipe
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

- Reorder stripes (no ticket) — 2026-11-13 — during a track drag, lanes and column cells take the stripe of
  the slot they're heading to (`laneSlotDuringDrag`, `drag.target`), so rows keep alternating; fresh preview
  builds of 11db62a + this fix as a preview OTA
- Transport check (no ticket) — 2026-11-13 — Back to start keeps playing and always reveals 0:00
  (`revealPlayhead`), recording clock shows the timeline position; kept Stop → take start; record-while-playing
  added to T25
- T29 — Record button: stop, not pause — 2026-11-13 — stop square while recording, larger record glyph nudged up 1 pt (stop glyph checked mid-recording on iOS)
- T23 — Reorder tracks — 2026-11-13 — long-press a grip to lift and drag a track, other lanes glide aside,
  edge auto-scroll, one undo step (`moveTrackEdit`), screen-reader Move up / Move down
- T15 — Arming & input meter — 2026-11-13 — tapping a name pill toggles arming, saved per idea (migration v2),
  nothing armed → Record grayed out; live input meter while armed and idle (`use-input-meter.ts`)
- T28 — Track column v2 — 2026-11-13 — 38 pt column with one grip per track, arm by tapping the name pill, the
  mixer's info button opens the track sheet, 0:00 flush with the column
- T22 — Transport & playhead polish — 2026-11-13 — Back to start stops playback, Play ↔ Pause, playhead ends at
  the last lane
