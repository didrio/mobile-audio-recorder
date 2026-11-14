# Tickets archive

Oldest finished tickets, moved out of `TICKETS.md` to keep it lean. Newest first.

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
