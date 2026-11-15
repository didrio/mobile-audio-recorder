# Tickets archive

Oldest finished tickets, moved out of `TICKETS.md` to keep it lean. Newest first.

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
- T42 — Shelve Speaker mode — 2026-11-14 — `SPEAKER_MODE_ENABLED = false` in `@/lib/echo-canceller` hides the
  Settings section and forces `useSpeakerRecording().clean` false (saved `speakerMode: true` ignored); silent
  recording unaffected; code kept, docs and a Backlog line say how to bring it back. Unit tests only: the
  Settings screenshots weren't verified (the simulator ran an old bundle)
- T19 — Folders & favorites — 2026-11-14 — `folders` table + `projects.folder_id` (SET NULL safety net) and
  `favorite` (migration v12); one `IdeasListScreen` for the root, `folder/[id]` and `favorites`, derived by pure
  `folder-tree.ts` (subtree search with folder paths, Recent counts activity inside folders, delete counts, move
  validation); star by swipe right / long-press / idea "⋯"; "+" New Idea / New Folder; Move to… sheet
  (`move-to.tsx`); reusable select mode (`use-selection.ts`, `selection-bar.tsx`: iOS bottom toolbar) with Move /
  Delete through `deleteItems` in `folders-repo.ts` (a soft delete since T41); `useActionMenu` for long-press menus.
  Simulator light + dark; Android untested
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
- T35 — Live waveform in step with the take during pre-roll — 2026-11-14 — `drawLivePeaks` anchors bars at the
  take file's start (`peaksStart`, before the punch with pre-roll) instead of the punch; the index/x math is in
  `livePeakRange` / `livePeakPoint` (`timeline-math.ts`, unit tests). Seen on the simulator
- T31 — Grid visibility & snap; pre-roll button in the transport — 2026-11-14 — pre-roll toggle is a plain icon
  right of Record (empty slot on the left keeps Back/Play/Record in place); per-idea Snap toggle in the strip
  (`projects.snap`, migration v7, saved not undoable, copied by Duplicate, disabled with the grid hidden); Snap
  off = no grid snapping for clips (clip edges still snap) and dotted fainter grid lines; sticky playhead on
  ruler scrub/tap with a haptic (`activeSnapStep`, `stickyTime` in `grid-math.ts`); beat lines stronger
  (`GRID_BEAT_ALPHA` 0.32, bar 1.5 pt); "Record new idea" starts with the grid off, "+" with it on
  (`createProject({ grid })`). Simulator light + dark; device check pending
- T34 — Silent recording — 2026-11-14 — Settings → Silent recording (off by default, speaker only like
  Speaker mode): the run-up plays as usual, then the whole output fades out on the master gain 100–70 ms
  before the punch (`silenceOutput` in `audio-engine.ts`, `silentFade` / `punchLead` in `take-alignment.ts`;
  on-the-fly punches come ~0.1 s later so the fade fits); pre-roll off = backing runs muted from the start;
  beat display shows while recording silently even for Sound-only metronomes; Speaker mode skips cleaning
  silent takes. Simulator + unit tests only; device check pending
- T33 — Visual metronome — 2026-11-14 — beat display under the strip while the metronome is on (one block per
  beat, 6/8 and 12/8 grouped, current beat lit with a flash, green downbeat token), driven on the UI thread by
  the transport's unclamped `beatClock` (counts in before 0:00) with `beatAt` in `metronome.ts`; per-idea
  output Sound / Visual / Both in Idea settings (undoable, migration v6; Visual = engine click at volume 0, so
  timing and alignment are unchanged); "Use Visual" hint in Speaker mode. Simulator only; device check pending
- T21 — Speaker mode (echo cancellation) — 2026-11-14 — after Stop, the backing that played is removed from
  takes recorded without headphones (local module `modules/echo-canceller`: C core with a fixed
  speaker → room → mic model incl. distortion, delay search, measured click suppression; Swift wrapper, iOS
  only, T32 for Android); raw take kept as `.raw.wav`; Settings → Speaker mode (experimental, off by
  default) with Light/Strong. iOS voice processing and SpeexDSP were tried and rejected (details in
  `docs/decisions.md`). Two iPhone tests: tracks cancel decently, clicks better but audible → T33 + T34.
  Also: DEV/PREVIEW labelled app icons (`app.config.ts`), e2e flows fixed (Settings scroll, wait for Record)
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
- T29 — Record button: stop, not pause — 2026-11-13 — stop square while recording, larger record glyph nudged up 1 pt (stop glyph checked mid-recording on iOS)
- T23 — Reorder tracks — 2026-11-13 — long-press a grip to lift and drag a track, other lanes glide aside,
  edge auto-scroll, one undo step (`moveTrackEdit`), screen-reader Move up / Move down
- T15 — Arming & input meter — 2026-11-13 — tapping a name pill toggles arming, saved per idea (migration v2),
  nothing armed → Record grayed out; live input meter while armed and idle (`use-input-meter.ts`)
- T28 — Track column v2 — 2026-11-13 — 38 pt column with one grip per track, arm by tapping the name pill, the
  mixer's info button opens the track sheet, 0:00 flush with the column
- T22 — Transport & playhead polish — 2026-11-13 — Back to start stops playback, Play ↔ Pause, playhead ends at
  the last lane
- Backlog planning 3 — 2026-11-13 — new T28 (track column v2: arm button only in the mixer, narrow grab-handle column, armed track marked on its name label); T15 and T23 rewired onto it, T23's grab target is now the handle
- Backlog planning 2 — 2026-11-13 — new T22 (transport & playhead polish), T23 (reorder tracks), T24 (idea notes), T25 (pre-roll), T26 (loop region), T27 (loop recording & takes); T17's count-in now builds on T25, T18 gets per-section notes; chord progressions, comping and four pitched ideas added to Backlog
- T14 — Editor layout v2 — 2026-11-13 — fixed 88 pt lanes with "N more" chips, arm-only column that expands into a mixer (mute, solo, relative-drag volume; mute/solo pulled in from T6; per-track `GainNode`s applied live), "+ New Track" row, status strip + compact transport (landscape: button column), header Undo · Redo · ⋯ placeholders (Android: `@expo/ui` dropdown); iOS preview OTA `01a1d6bf` published; checked on the iOS simulator (both orientations, light/dark, 1 and 8 tracks) and the Android header; e2e skipped
- T13 — Editor store & undo/redo — 2026-11-13 — the open idea lives in a zustand editor store (`editor-store.ts`): edits are before/after row snapshots applied in memory and written through to SQLite in a serial queue, 100-step undo/redo per open idea with header buttons (idle only), record / add / rename / delete track undoable, armed track in the store, unused takes (rows + files) deleted when an idea opens; checked on the iOS simulator (record over a take → Undo restores it whole; reopen cleans up the undone take)
- Backlog planning — 2026-11-13 — 17 user ideas turned into tickets: new T13–T21 (undo, layout v2, arming/meter, folders, tempo/metronome split, sections, clip options, pitch keyboard, speaker mode); T5/T6/T9/T10 rewritten; editor design decisions recorded at the top of Up next
- T4 — First preview build — 2026-11-13 — EAS project `@ididrio/audio-recorder` linked with OTA updates, iOS preview built and working on the iPhone, Android preview rebuilt arm64-only after an out-of-memory failure (install + OTA check moved to T12); fixed on Android: missing Add track button (`Stack.Toolbar.Button` needs an image icon there) and a blank band under the header; e2e green on both platforms
- Polish after T3 — 2026-11-13 — timeline horizontal in both orientations (vertical portrait layout removed with `timeline-axis.ts`), waveforms scaled to one shared per-project level (true relative loudness), tap anywhere to seek, drag on the ruler to move the playhead (with a handle), leading space before 0:00, transport is Back to start · Play (largest, centered) · Record, headphones hint removed; recording onto a track now replaces what's under the new take (overlapped clips trimmed/split, `clip-overlap.ts`; takes kept), clips outlined, playback cancels superseded starts and releases its audio graph, the view no longer jumps away from the playhead after Stop (zoom fit runs on the UI thread)
- T3 — Multitrack overdub — 2026-11-13 — add/rename/delete/arm tracks (lane headers + track sheet), record at the playhead over the other tracks with measured start + latency compensation and a Settings offset, live waveform; fixed the playhead clock (JS and UI `performance.now()` differ, `ui-clock.ts`); overdub Maestro flow
- T2 — Timeline view — 2026-11-11 — Skia timeline (lanes, clips with cached waveform peaks, ruler, UI-thread playhead with follow), pan/pinch/ruler seek, Play from the playhead, portrait/landscape layouts; Maestro hang traced to NTKDaemon on port 5563 (e2e warns now); smoke flow covers quick capture
- T1 — Shape the app — 2026-11-11 — idea agreed (multitrack song sketchpad), recording red, react-native-audio-api engine + background config, SQLite non-destructive data model, Ideas list with quick-capture record button, project screen recording/playing takes on track 1, T2–T11 written
