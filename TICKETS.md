# Tickets — Audio Recorder

Living, ordered backlog. One ticket per session: `/clear` → `/start Tn` → work → `/wrap`. The agent that wraps a
session updates this file and picks the next ticket, so each new session starts with a small, clear context.
Rules: `.claude/skills/wrap/SKILL.md`. Capture ideas any time with `/ticket`.

**Next:** T22 — Transport & playhead polish · Sonnet · low effort · plan mode off, then T28, then T15 (T12 can be run any
time the Android build is done)

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
tries it; Maestro, the Android emulator and the two-platform export only at milestones (T4, releases, native
dependency changes). See the `wrap` skill.

**Editor design agreed with the user (2026-11-13), used by T13–T19, T5, T6, T9, T10, T16:**

- **Interaction model** for everything on the timeline (clips in T5, section labels in T18): tap selects
  (highlight, edge handles, small floating action bar). Drag a _selected_ item to move it, drag its handles to
  trim or resize. Long-press an unselected item to pick it up and move it in one go (haptic on pickup).
  Dragging an unselected item scrolls the timeline, so nothing moves by accident. Tapping a clip never moves
  the playhead. Tapping empty lane space or the ruler seeks and deselects. Tapping a section label also jumps
  the playhead to its start.
- **Layout** (built in T14, column reworked in T28): fixed 88 pt lanes. A narrow pinned column on the left
  holds one grab handle per track (long-press to reorder, T23); the sliders button in the corner above it
  expands it into a mixer (arm · Mute · Solo · horizontal volume), pushing the timeline right. Arm buttons
  appear only in the mixer; the armed track shows as a red outline and dot on its name label. Mute/solo also show as M/S badges on the floating track names, and silent
  tracks' clips are drawn faded. Tapping a track name opens its sheet (Rename, Delete; no Duplicate). The
  section-label rail sits above the ruler. Thin status strip (time · metronome toggle · meter). Compact
  transport. "+ New Track" is a row after the last lane, not a header button.
- **Header of an idea**: Undo · Redo · "⋯" (Idea settings, Duplicate, Delete, Favorite). The menu exists since
  T14 with disabled placeholders: items in `src/features/project/idea-menu-items.ts`, iOS
  `Stack.Toolbar.Menu` in `project-screen.tsx`, Android `@expo/ui` Compose dropdown in
  `android-idea-menu.android.tsx`. Enable an item by giving it an action there.
- **Undo/redo** covers every edit, in memory per open idea (100 steps), cleared when leaving the idea. Built in
  T13: a new edit is a pure builder in `src/features/project/edit-commands.ts` returning an `Edit` (before/after
  snapshots of the rows it touches, `edit-changes.ts`), applied with `executeEdit()` from `editor-store.ts`. One
  gesture = one `executeEdit` at its end (live values during a drag go through shared values). A new table
  (sections, idea settings) needs a `Change` variant, `applyToProject` and `saveChanges` support.
- **Arming**: a toggle, one armed track at a time (multi-arm deferred to Backlog: one phone mic would only
  record the same audio onto each track). Nothing armed → Record grayed out.
- **Ideas list**: sort options (no manual drag ordering), folders with unlimited depth, Favorites as a virtual
  folder.

### T12 — Android preview install, first OTA, real-device checks

- **Status:** waiting on EAS build `c76cc997-894b-4588-8f0f-140d1e309725` (Android preview, queued 2026-11-13)
- **Session:** Sonnet · medium effort · plan mode off (Opus · high if the build failed again or audio bugs show up)
- **Goal:** Finish what T4 couldn't: Android preview installed, an OTA update received on both phones, and the
  recording checks on real devices.
- **Done when:**
  - [ ] Build finished: `npx eas-cli@latest build:view c76cc997-894b-4588-8f0f-140d1e309725` (status, runtime
        version, install URL). Failed? See "Reading a failed build's log" in `docs/releasing.md`.
  - [ ] Android preview installed (open the build page on the phone, download the APK); Settings → Update says
        "Embedded bundle".
  - [ ] `npm run update:preview -- --message "…"` published **after** that build finished; after two cold starts
        each phone's Settings → Update shows an update ID (iOS build `26395197-f570-44e6-99ba-547315ac1ea3` is
        already installed and works).
  - [ ] Real-device checks below done on both phones; findings fixed or ticketed; per-device latency offsets
        noted in `docs/releasing.md`.
- **Context:** T4 handoff: the first Android cloud build died (Gradle out of memory compiling C++ for four ABIs),
  so preview builds are now arm64-v8a only (`eas.json`); expect 40+ minutes of free-plan queue and build. That
  build already contains the Android header fixes (`ceccb3c`); the OTA test only needs some update published
  after it, no throwaway visible change. Done in T4: emulator build, Android timeline screenshots, e2e on both
  platforms, iPhone install. **Device checks:**
  - Recording: mic permission prompt, speaker vs. earpiece routing, Bluetooth headphones.
  - Timeline: pinch-zoom and pan momentum feel, tap-to-seek, dragging the playhead on the ruler, playhead vs.
    audio sync, smooth playback on a 3-minute idea with several takes.
  - Overdub (with headphones): record a clap against an existing take, play both back, they should line up; if
    not, tune Settings → Recording → Latency offset and note the value per device. Try Bluetooth too (much
    higher latency) and delete a track from its sheet.
  - Record over the middle of a take on the same track (three clips end to end), then Play several times in a
    row and seek while playing; playback must stay audible.
  - Whoever does T15 repeats its mic checks on devices (mic indicator, Bluetooth quality while armed).
  - Mixer (T14): drag a track's volume while playing (smooth, no clicks?), mute/solo during playback and while
    recording an overdub (backing changes, the take doesn't).
  - OTA note: an iOS-only preview update (`01a1d6bf`, T14) is already published; Android still needs an update
    published after its build finished (`npm run update:preview` covers both).

### T22 — Transport & playhead polish

- **Status:** ready
- **Session:** Sonnet · low effort · plan mode off
- **Goal:** Small transport fixes from the user (2026-11-13): no square stop buttons, Back to start stops
  playback, and the playhead stays inside the lanes.
- **Done when:**
  - [ ] Back to start stops playback (stop, then `seek(0)`). It stays disabled while recording.
  - [ ] No square stop icon anywhere. While playing, Play becomes **Pause** (`pause.fill` / `pause`); it stops
        and leaves the playhead where it is, as Stop does today. While recording, the Record button shows Pause
        (red) and stops the take. Accessibility labels: "Pause" and "Stop recording".
  - [ ] The playhead line ends at the bottom of the last lane, so it never shows over the "+ New Track" row or
        the empty space below it. The ruler handle stays as it is.
  - [ ] Tests updated (`project-screen.test.tsx` queries by label), plus a simulator screenshot.
- **Context:** The transport buttons are `backToStart` / `playButton` / `recordButton` in `project-screen.tsx`.
  The playhead is drawn at the end of the picture in `timeline.tsx` with `drawLine(x, 0, x, viewHeight)`. Clamp
  the end to `min(viewHeight, RULER_SIZE + trackCount * lane - laneScroll)`.

### T28 — Track column v2: arm in the mixer, grab handle, armed name

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** The lanes get more room and arming is less in-your-face (user, 2026-11-13). The arm button moves
  into the mixer, the collapsed column becomes a narrow grab handle per track (T23 builds the reorder on it),
  and the armed track shows on its name label instead.
- **Done when:**
  - [ ] Mixer open: each row is arm · Mute · Solo · volume, as today (arm stays leftmost). Mixer closed: no arm
        buttons at all.
  - [ ] Collapsed column narrows from 44 pt to about 30 pt (`CONTROLS_WIDTH` in `timeline-math.ts`; the user
        suggested 60–70 % of today's width; go wider if it's hard to hit, the lanes are 88 pt tall so the
        target stays big). The mixer toggle in the corner above it shrinks to the same width; its icon still
        fits (`TOGGLE_SIZE` is 30). Keep its hit area at least 44 pt tall.
  - [ ] Each collapsed cell is the track's grab handle and holds nothing else except a faint grip glyph
        (`line.3.horizontal` / `drag_indicator`, `textSecondary`, small) so it reads as "hold to move" instead of
        a blank gutter. Drop the glyph if the screenshot looks cleaner without it. No gesture yet (T23).
  - [ ] Armed track shown on its floating name label (`lane-overlay.tsx`): a red outline on the pill plus a small
        red dot before the name (the record symbol), so it isn't color-only. Accessibility: the name button's
        label includes "armed". Text color stays as is for legibility. Visible with the mixer open or closed.
  - [ ] Tests updated: `track-column.test.tsx`, `lane-overlay.test.tsx`, and `project-screen.test.tsx` (arming
        now needs the mixer open first). `.maestro/overdub.yaml` taps the arm button: open the mixer first there.
        Simulator screenshots: mixer closed/open, light/dark, 1 and 8 tracks.
- **Context:** Column: `src/features/timeline/track-column.tsx` (`armWidth` = the collapsed width, arm button
  labelled `Arm <name>`); mixer width math and the corner toggle (`accessibilityLabel="Mixer"`) in `timeline.tsx`.
  The editor design's **Layout** bullet above is updated for this. Do this before T15 and T23, which both
  touch the column.

### T15 — Arming & input meter

- **Status:** ready (after T28, which moves the arm button into the mixer)
- **Session:** Opus · high effort · plan mode on
- **Goal:** Arming works like a DAW: toggle it, and the meter shows the live mic input while a track is armed.
- **Done when:**
  - [ ] Tapping the arm button toggles it: tapping the armed track unarms it (the user asked for this again on
        2026-11-13). Arming a track disarms the previous one (one armed track at a time). Nothing armed → Record
        is grayed out.
  - [ ] The armed track is saved per idea (`projects.armed_track_id`, nullable, in the next migration of
        `src/lib/db.ts`). New ideas (quick capture and T10's New Idea) arm Track 1. Deleting the armed track
        clears it.
  - [ ] Input meter: while a track is armed, the idea is on screen and the app is in the foreground, the mic
        input runs for metering only (not written to a file). Unarmed, backgrounded or leaving the screen
        releases the mic. Nothing armed → the meter shows empty/dimmed.
  - [ ] Checked on a real iPhone: the orange mic indicator only shows while armed. Check Bluetooth headphones
        too: many drop to low-quality "call" audio while the mic is open. If that's bad, note it and ticket a
        fallback (e.g. meter only while recording when Bluetooth output is active).
- **Context:** The arm buttons are in the mixer rows since T28 (`src/features/timeline/track-column.tsx`, shown
  only with the mixer open); the armed track is marked on its name label (`lane-overlay.tsx`). The armed track lives in the editor store since T13 (`armedTrackId`, `armTrack`,
  `selectArmedTrack` with its fall back to the first track, in `src/features/project/editor-store.ts`); persist it
  there (write on `armTrack`, read in `openIdea`). Arming isn't an undo step. Today the meter is fed by
  `setLevel(peakLevel(samples))` in `use-transport.ts` only while recording. First check in
  `node_modules/react-native-audio-api` (types/docs) how to get input samples
  without recording to a file, and whether opening the input changes the audio session for playback. Multi-arm
  with per-track inputs is in Backlog.

### T23 — Reorder tracks

- **Status:** ready (after T28, which adds the grab handles, and T15, which also changes `track-column.tsx`)
- **Session:** Opus · high effort · plan mode on
- **Goal:** Move tracks up and down without adding any buttons: long-press a track's grab handle (its cell in
  the collapsed column, T28), drag it, let go.
- **Done when:**
  - [ ] Long-pressing a track's grab handle (mixer closed) picks the track up. With the mixer open there's no
        handle (the arm button sits there), so reordering needs the mixer closed. A haptic plays, and the cell and its lane lift slightly
        (scale about 1.03, shadow, a bit of transparency). This is the standard "lift and drag" pattern; a wiggle
        means edit mode on iOS, so we don't use one. The track follows the finger vertically, the other tracks
        slide aside with animation, and releasing drops it. There's no cancel button.
  - [ ] The column auto-scrolls when the track is dragged near the top or bottom edge (with many tracks).
  - [ ] A reorder is one undoable T13 command (`moveTrackEdit` in `edit-commands.ts`) that rewrites
        `tracks.position`. No migration: `position` already exists in `src/lib/db.ts`.
  - [ ] A plain tap on a grab handle does nothing.
  - [ ] Unit tests for the position math. The feel is checked on a device.
- **Context:** The column is `src/features/timeline/track-column.tsx`. Lanes are drawn in `timeline.tsx` (Skia)
  in track order. The floating track names are in `lane-overlay.tsx`. Live drag offsets go through shared values,
  committed once at the end of the gesture (the T13 rule). See the "Shared values moved on the UI thread"
  gotcha in AGENTS.md.

### T25 — Pre-roll (punch in at the playhead)

- **Status:** ready (after T15; T17 builds its count-in on it)
- **Session:** Opus · high effort · plan mode on
- **Goal:** Record into an exact spot with a run-up: playback starts a little before the playhead, including
  the armed track's own audio, and recording kicks in exactly at the playhead. The user asked for this on
  2026-11-13 ("so you can anticipate what's coming").
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
  - [ ] Unit tests for the timing math (run-up start, clamping at 0, clip offset).
- **Context:** Recording start, playback during overdub and latency compensation are in
  `src/features/project/use-transport.ts` (`record`) and `src/features/audio/take-alignment.ts`; scheduling is
  in `audio-engine.ts` (`play()`). The armed track has to play during the run-up and be cut at the punch point:
  schedule its clips to end there, or ramp its track gain to 0 (`setTrackGain`). T17's count-in becomes this
  pre-roll plus clicks. The punch-out end point comes with loop recording (T27).

### T26 — Loop region

- **Status:** ready (after T25; the "Loop" actions on clips and sections come with T5 / T18, whichever exists)
- **Session:** Opus · high effort · plan mode on
- **Goal:** Record a riff and hear it loop right away: one loop region, set in a tap, with gapless looped
  playback. Agreed with the user (2026-11-13): a core recording feature, kept simple. No per-clip loop toggles
  or Ableton-style clip repeating (the region plus T5's Duplicate cover that).
- **Done when:**
  - [ ] A Loop toggle in the transport (SF `repeat`, Material `repeat`), saved per idea with the region
        (migration: `projects.loop_on`, `loop_start`, `loop_end`, nullable).
  - [ ] The region shows as a tinted band on the ruler with a handle at each end. Dragging a handle resizes the
        region (snaps to bars with the grid on, T9). Everything else on the ruler still scrubs the playhead, so
        the handles are hit-tested first. While Loop is on, the lanes inside the region get a light tint.
  - [ ] Setting it needs no extra buttons. Turning Loop on with no region uses the selected clip or section if
        there is one, otherwise the last recorded clip, otherwise 8 s (or 2 bars) from the playhead. "Loop" in
        the clip action bar (T5) and the section action bar (T18) sets the region and turns Loop on.
  - [ ] Playback with Loop on starts at the playhead if it's inside the region, otherwise at the region start.
        At the region end it wraps back without a gap or click (iterations scheduled ahead on the context
        clock). The playhead and clock wrap too.
  - [ ] Changing the region isn't an undo step (like the playhead). Unit tests cover the wrap/scheduling math.
- **Context:** `play()` and `PlayableClip` are in `audio-engine.ts`. The library's buffer-source
  `loop`/`loopStart`/`loopEnd` only loops one buffer, so multitrack looping means rescheduling every clip each
  iteration. The playhead anchor math is in `use-transport.ts` (`playbackAnchor`), and the ruler gesture is in
  `timeline.tsx`. The transport and status strip are getting crowded (pre-roll, notes, keyboard, metronome):
  check with a screenshot.

### T27 — Loop recording & takes

- **Status:** ready (after T25 and T26)
- **Session:** Opus · high effort · plan mode on
- **Goal:** Sing over a loop again and again and keep the best pass. It also gives the punch-in/out with an
  end point the user asked for. Takes are a badge plus a picker, not take lanes.
- **Done when:**
  - [ ] Record with Loop on: the pre-roll runs first (T25), then recording covers the region pass after pass.
        It is one continuous recorder file (no gaps at the wrap), and each complete pass is a window into that
        take (`offset` = pass × length, plus the latency shift). The armed track is silent inside the region
        while recording.
  - [ ] On Stop: the clip in the region is the last complete pass, and earlier passes are kept as alternates.
        An unfinished final pass is dropped. With no complete pass, it behaves like a normal punch-in.
        Recording one pass and stopping during the next is the punch-in/out.
  - [ ] The clip shows an "N takes" badge. Tapping it opens a take picker sheet: Take 1…N, each with a
        listen button (plays the region with that take in place). Tapping one chooses it; takes other than the
        chosen one can be deleted. Choosing is undoable.
  - [ ] Data: a `clip_alternates` table (clip_id, take_id, offset, position), a `Change` variant in
        `edit-changes.ts`, and support in `applyToProject` / `saveChanges`. The open-idea cleanup of unused
        takes counts alternates as used. Trimming or splitting a clip with alternates drops them; the action says
        so.
  - [ ] Unit tests for the pass math (pass windows, latency shift, dropped partial pass). Checked on a device
        with headphones: passes line up with the loop.
- **Context:** Recording is in `use-transport.ts` (`record`) and `take-alignment.ts`, overlap/replace in
  `clip-overlap.ts`, and edit builders in `edit-commands.ts` (`recordTakeEdit`). Clips are already windows onto
  immutable takes (`db.ts` header), so passes need no new files. Comping is in Backlog.

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
  - [ ] Every edit is a T13 store command (one undo step per gesture).
  - [ ] Unit tests for the pure edit operations (move/trim/split math).
- **Context:** Gestures in `timeline.tsx` (pan = scroll, pan starting on the ruler = drag the playhead, pinch
  = zoom, tap = seek). A tap needs hit-testing: clip → select, empty lane space → seek. Waveform paths are
  cached per clip window (`waveform-path.ts`), so a trim just asks for a new window. Selection and handles are
  drawn in the per-frame picture, driven by shared values. Moving a clip between tracks only changes its
  `trackId`. Edits: builders in `edit-commands.ts` (see `recordTakeEdit` for `clearRange` → changes) and
  `executeEdit`; history and write-through come for free. T18 reuses this selection and drag code for section
  labels, so keep it generic (an item with start/duration on a row).

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
        context menu on rows. Duplicate and Delete are also in the idea's "⋯" header menu (T14). Rename there
        lives in Idea settings (T9).
  - [ ] Date under each idea. Sort menu: Recent (default), Name, Date created (remember the choice in
        `@/lib/storage`). Search in the header.
  - [ ] Storage used by recordings shown in Settings.
- **Context:** `deleteProject` (rows + files) and `useDeleteProject` (also clears decoded buffers) already exist
  in `src/features/projects/` but have no UI yet. Names default to "Idea N" (`createProject`). The list is
  `src/features/projects/projects-screen.tsx`. T19 adds folders on top of this screen, so keep the row and
  sort code reusable for a folder's contents.

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
  - [ ] T10's Duplicate copies the notes (if T10 is done; otherwise note it there).
  - [ ] Unit tests for finding and inserting time stamps.
- **Context:** Decided with the user (2026-11-13): idea-wide notes first, because they work without sections and
  add almost no UI. Per-section notes are part of T18, and first-class chord progressions are in Backlog. The status
  strip and menu items are in `project-screen.tsx` and `src/features/project/idea-menu-items.ts`. Time formatting
  is in `src/features/audio/format-time.ts`. A later Search (T10/T19) could match notes too.

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
        timeline, not in the mixdown. Volume follows a "Keyboard volume" setting.
  - [ ] Unit tests for note ↔ frequency and note names.
- **Context:** `react-native-audio-api` has `createOscillator` (see `lib/typescript/module/jsi-interfaces.d.ts`).
  Play it through the same `AudioContext` as playback in `audio-engine.ts` so it works during playback.
  Product rule: no software instruments. This stays a pitch reference, so don't grow it into a recordable
  instrument. A mic tuner is the natural companion (Backlog).

### T9 — Idea settings, tempo & grid

- **Status:** ready (after T13; snapping needs T5)
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
  - [ ] Settings changes are T13 store commands (undoable).
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
  - [ ] Metronome on/off toggle in the status strip (T14), saved per idea. Metronome volume in Idea settings
        (migration).
  - [ ] Clicks during playback and recording, never recorded into takes (with headphones). The click lines up
        with takes after latency compensation (record a clap on the click on a device and check).
  - [ ] Count-in is T25's pre-roll with clicks: with the metronome on, the run-up clicks (whole bars, so the
        punch lands on the beat as counted). No separate count-in toggle. The take starts at the playhead, not
        before.
  - [ ] T8's mixdown leaves the click out.
- **Context:** Scheduling and playback helpers live in `audio-engine.ts`. Recording start and latency
  compensation: `take-alignment.ts` and `use-transport.ts`. Turning the metronome on also turns the grid on.

### T21 — Speaker mode (echo cancellation)

- **Status:** ready (after T15 and T17)
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
  - [ ] Undoable (T13 store). Names truncate when the section is narrow.
  - [ ] The section action bar also gets **Notes**: an optional free-text note per section (chords, lyric cue),
        stored in `sections.notes`, with a small icon on the section when one is set. Complements T24's idea
        notes.
  - [ ] Palette colors are tokens in `src/theme/tokens.ts` (light and dark), readable label text on each.
- **Context:** Reuse T5's selection and drag code. Draw the rail in the same per-frame Skia picture as the
  ruler. Looping a section is in Backlog.

### T16 — Clip options

- **Status:** ready (after T5)
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** Per-clip adjustments from the clip action bar's "Options…".
- **Done when:**
  - [ ] Options… opens a sheet for that clip: Gain (dB slider, double-tap to reset), Fade in and Fade out
        (length), Restore full take (reset the trim to the whole take, where it fits), Share take (once T8 is
        done), Delete.
  - [ ] Migration: `clips.gain` (1), `fade_in` (0), `fade_out` (0). The engine applies gain and fades with
        gain ramps, plus a few-millisecond automatic declick fade on every clip edge.
  - [ ] Waveform drawing reflects clip gain. Changes are undoable (T13 store).
- **Context:** Since T14 clips play through one `GainNode` per track (`play()` in `audio-engine.ts`), so clip
  gain and fades need a per-clip `GainNode` between the source and its track gain (add `gain`/fades to
  `PlayableClip`). T8's mixdown must apply the same gain and fades.

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
  recorder segments. Export files go to the cache directory and are deleted after sharing. The mixdown must
  match playback: track volume, mute and solo (T14: `trackOutputGain` in `src/features/project/mixer.ts`), master
  volume (T6), clip gain and fades (T16), and leave out the metronome (T17). Whatever of those exists when this
  ticket runs.

### T6 — Master volume & track colors

- **Status:** ready
- **Session:** Sonnet · medium effort · plan mode off
- **Goal:** A master volume and optional track colors. (Track volume, mute and solo were built in T14's mixer.)
- **Done when:**
  - [ ] Master volume (where: the mixer's corner, status strip or Idea settings; decide in the session), saved
        per idea (migration), applied live through the engine's master `GainNode` in `play()`, undoable.
  - [ ] Optional track color (migration), picked in the track sheet, used for the clips and the name label.
  - [ ] Undoable (T13 store: a `trackSettingEdit`-style command in `edit-commands.ts`).
- **Context:** Per-track gain is `setTrackGain` in `audio-engine.ts`, fed by `trackOutputGain` (`mixer.ts`)
  from an effect in `use-transport.ts`. A master gain needs the same "live + effect" path. Clip colors go in
  `makePaints`/the clip loop of `timeline.tsx` (light and dark tokens).

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
- Comping: build one take from parts of several loop passes (after T27).
- Input monitoring through headphones; input gain; input device picker (`AudioManager.getDevicesInfo`). With a
  multi-input audio interface: arm several tracks at once, each recording its own input (deferred from T15).
- Recently Deleted: soft-delete ideas and folders, keep them 30 days, restore from a "Recently Deleted" folder
  (after T19).
- Quick listen: play an idea from the Ideas list without opening it, with a scrubber under the row (reuse
  `play()` from `audio-engine.ts`; only one idea plays at a time). Moved from T10.
- First-class chord progressions per section (chord picker, chord symbols drawn on the section rail). Revisit
  once T24's idea notes and T18's section notes have been used for a while.
- Tuner: show the pitch the mic hears (note + cents), next to T20's keyboard.
- Pitched 2026-11-13, not agreed yet (recording-focused tools, not DAW features):
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
  on Stop); count-in arrives with T17; input monitoring is above.
- Maestro: `tapOn` by `accessibilityLabel` doesn't focus a `TextInput` on iOS (tap by point instead).
- Android emulator: the old "Idea 1" clip draws without a waveform (center line only); not investigated in
  T14 (missing take file or peaks?). Check on a real device in T12.
- Clock text runs ~0.1–0.3 s ahead of the playhead (the playhead includes output latency). Show the clock from
  the playhead instead once a cheap way to do it without per-frame React renders exists.

## Done

- Backlog planning 3 — 2026-11-13 — new T28 (track column v2: arm button only in the mixer, narrow grab-handle
  column, armed track marked on its name label); T15 and T23 rewired onto it, T23's grab target is now the handle

- Backlog planning 2 — 2026-11-13 — new T22 (transport & playhead polish), T23 (reorder tracks), T24 (idea
  notes), T25 (pre-roll), T26 (loop region), T27 (loop recording & takes); T17's count-in now builds on T25,
  T18 gets per-section notes; chord progressions, comping and four pitched ideas added to Backlog

- T14 — Editor layout v2 — 2026-11-13 — fixed 88 pt lanes with "N more" chips, arm-only column that expands
  into a mixer (mute, solo, relative-drag volume; mute/solo pulled in from T6; per-track `GainNode`s applied
  live), "+ New Track" row, status strip + compact transport (landscape: button column), header Undo · Redo ·
  ⋯ placeholders (Android: `@expo/ui` dropdown); iOS preview OTA `01a1d6bf` published; checked on the iOS
  simulator (both orientations, light/dark, 1 and 8 tracks) and the Android header; e2e skipped

- T13 — Editor store & undo/redo — 2026-11-13 — the open idea lives in a zustand editor store (`editor-store.ts`):
  edits are before/after row snapshots applied in memory and written through to SQLite in a serial queue,
  100-step undo/redo per open idea with header buttons (idle only), record / add / rename / delete track
  undoable, armed track in the store, unused takes (rows + files) deleted when an idea opens; checked on the iOS
  simulator (record over a take → Undo restores it whole; reopen cleans up the undone take)

- Backlog planning — 2026-11-13 — 17 user ideas turned into tickets: new T13–T21 (undo, layout v2, arming/meter,
  folders, tempo/metronome split, sections, clip options, pitch keyboard, speaker mode); T5/T6/T9/T10 rewritten;
  editor design decisions recorded at the top of Up next

- T4 — First preview build — 2026-11-13 — EAS project `@ididrio/audio-recorder` linked with OTA updates, iOS preview
  built and working on the iPhone, Android preview rebuilt arm64-only after an out-of-memory failure (install +
  OTA check moved to T12); fixed on Android: missing Add track button (`Stack.Toolbar.Button` needs an image icon
  there) and a blank band under the header; e2e green on both platforms
