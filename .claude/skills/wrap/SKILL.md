---
name: wrap
description: End a work session — final quality pass, update TICKETS.md (outcomes, handoff notes, new or reordered tickets, next pick with recommended model/effort/plan mode), commit (push if a remote exists), backport generic improvements to the base template and sync them back, and print the steps for the next session. Only when the user types /wrap.
disable-model-invocation: true
---

# Wrap a session

The next session starts with only `AGENTS.md`, `TICKETS.md` and git history. Make them enough.

## 1. Final pass

- `npm run check` passes. Fix what it reports, or stop and tell the user why you can't.
- UI changed and a simulator/emulator is available: screenshot the affected screens (light and dark) and look at
  them. The user tries changes themselves right after the session, so keep this quick.
- **Milestones only** (a preview/store build, a release, or native/dependency changes): also `npm run e2e`, the
  other platform's emulator, and `npx expo export --platform ios --platform android`. While the app is being
  iterated, these slow sessions down more than they catch; say in the hand-off that they were skipped.
- Review `git diff`: no debug logging, stray files, commented-out code, secrets, or TODOs you meant to finish.
- If a convention, command, script or architecture changed, update `AGENTS.md` / `docs/` / skills so they stay
  true.

## 2. Update TICKETS.md (the most important step)

- **Finished tickets** → move to **Done** as one line: `T5 — Title — YYYY-MM-DD — what changed, in a phrase`.
- **Unfinished tickets** → stay in **Up next** with an updated status and a **Handoff** bullet: what's done,
  what's left, where (files), gotchas, how to verify.
- **New work discovered** → new tickets with the next unused number (never reuse numbers). Write them so a fresh
  agent can start without re-investigating: goal, done-when checklist, the files and decisions involved, pitfalls,
  how to test. Vague ideas go to **Backlog** instead.
- Re-read **Up next** top to bottom: reorder by what should happen next; merge, split or rewrite stale tickets.
- Set the **Next:** line at the top to the recommended ticket and its session settings (table below). Every ticket
  in **Up next** has a **Session** line.
- Keep the file lean: if **Done** grows past ~30 lines, move the oldest lines to `docs/tickets-archive.md`.

### Choosing session settings

Goal: the best ratio of quality to cost and time. Pick the **cheapest row that will still get it right**.

| Ticket shape                                                                 | Model  | Effort     | Plan mode |
| ---------------------------------------------------------------------------- | ------ | ---------- | --------- |
| Architecture, data model, big refactor, ambiguous product questions          | Opus   | extra high | on        |
| New feature across several screens; native modules; build/release; hard bugs | Opus   | high       | on        |
| Well-specified feature or fix: the ticket already says what and where        | Sonnet | medium     | off       |
| Small UI/copy/styling tweaks, chores, docs                                   | Sonnet | low        | off       |

- A detailed ticket (files, decisions, how to verify) is what lets a cheaper session do the job well. Write it.
- Torn between two rows: go higher for things that are expensive to change later (data model, navigation
  structure, native setup, auth), lower for everything else.

## 3. Commit

- Stage everything that belongs to the session's work (`git status` must end clean, apart from intentionally
  untracked local files).
- Message: `T5: <summary>` (several tickets: `T5, T6: …`; no ticket: a plain summary), then short bullets of what
  changed, then the attribution trailer your harness asks for.
- Commit on the current branch. If the branch has an upstream (`git rev-parse --abbrev-ref @{u}` succeeds), push.
  Otherwise skip pushing and say so in one line.

## 4. Backport to the base

Apps share history with the base template (`base` remote, see the `sync-base` skill). Improvements every future
app needs go into the base, then come back through a sync, so both repos agree and later syncs stay clean.

1. **Pick candidates** from this session's commits (`git diff <session start>..HEAD`):
   - Belongs in the base: tooling and scripts, `.claude/` skills, `docs/` and `AGENTS.md` guidance that isn't
     about this app, lint/test/TS configs and generic test mocks, CI/EAS workflows, generic fixes to
     `src/components/ui`, `src/theme` (structure, not brand or product tokens) and `src/lib`.
   - Stays in the app: features, routes, product tokens and copy, `app.json` identity, `TICKETS.md`, flows for
     the app's screens, decisions about this app's stack.
   - Unsure or mixed (e.g. a generic fix inside a feature file): ask the user in one line, don't guess.
   - Nothing qualifies → say so in one line and skip to the hand-off.
2. **List them for the user** (one line each: file, what, why it's generic) and what stays app-only.
3. **Apply in the base** (path: `git remote get-url base`). Its working tree must be clean and on `main`;
   otherwise stop and tell the user.
   - If the base's file equals the app's file from before this session (`git diff base/main <session start> --
<file>` is empty), copy the app's file over. Otherwise apply only the generic change by hand.
   - Strip anything app-specific (names, bundle IDs, product terms) from what lands in the base.
   - In the base: `npm run check` must pass, then commit `From <app name>: <summary>` with short bullets and the
     attribution trailer. Push if the base's branch has an upstream (same rule as step 3).
4. **Sync back into the app**: `npm run sync-base` (the app's tree is clean after step 3), resolve as the
   `sync-base` skill says (usually nothing: the content already matches), `npm run check`, `git commit --no-edit`,
   push if there's an upstream.

## 5. Hand off

End your reply with exactly this shape (fill in the values):

```
✓ Wrapped T5 — <title> (<short hash>)

Next session:
1. /clear
2. Model: <Opus|Sonnet> · Effort: <medium|high|extra high> · Plan mode: <on|off>
3. /start T6 — <title>
```

Add one line for the base backport (`Base: <short hash> — <summary>`, or `Base: nothing to backport`), and at
most two lines for anything the user must do before then (e.g. "install the new dev build: `npm run ios`",
"decide X — it's in T6's open questions"). Then stop: the session is over.
