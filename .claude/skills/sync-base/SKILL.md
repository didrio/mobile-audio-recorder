---
name: sync-base
description: Bring later improvements from the base template into this app (tooling, skills, scripts, docs, design-system fixes, SDK upgrades) with `npm run sync-base`, and resolve the merge without losing app-specific work. Use for "update from the base", "pull base improvements", "sync with base", "get the latest template changes".
---

# Sync improvements from the base

Apps made with `npm run create-app` share the base's git history and have it as the `base` remote, so
`npm run sync-base` is a real git merge of `base/main`. It never commits: you resolve, check, then commit.
Background: "Keep up with the base" in `docs/new-app-checklist.md`.

## 1. Preview and tell the user

- The working tree must be clean: finish or commit the current work first.
- `npm run sync-base -- --dry-run` lists the incoming base commits and the files they touch. Summarize them for
  the user in a few lines (what improves, anything risky such as an SDK upgrade or native config change).
- An Expo SDK upgrade or another large change from the base deserves its own session: suggest a ticket instead of
  merging it in the middle of feature work.
- If it fails with "no `base` remote", ask the user where the base lives, then
  `npm run sync-base -- --base <path-or-url>`. If it fails with "does not share git history", follow the one-time
  fix in `docs/new-app-checklist.md`.

## 2. Merge

`npm run sync-base`. It keeps the app's `TICKETS.md`, regenerates `package-lock.json` if only the lockfile
conflicted, and prints the remaining conflicts and next steps. `git status` shows the state at any time;
`git merge --abort` undoes everything.

## 3. Resolve conflicts

Look at each conflict (`git diff <file>`) and decide by who owns the content:

| Content                                                                                                   | Rule                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| App identity and product: `app.json` name/slug/scheme/IDs/owner/EAS ids, README text, brand tokens, icons | Keep the app's values (`git checkout --ours <file>` when the whole file is the app's), but take the base's new keys and structure.                  |
| Starter content the app deleted or replaced (`src/features/home`, `.maestro/smoke.yaml`, …)               | Keep it deleted/replaced (`git rm <file>`, or `--ours`). Apply the base's _idea_ to the app's real screen only if it is a genuine improvement.      |
| Tooling the base owns: `.claude/`, `scripts/`, `docs/`, `AGENTS.md`, lint/test/TS configs, `.eas/`, CI    | Take the base's version (`git checkout --theirs <file>`), then re-add any app-specific lines the app had (for example an app section in AGENTS.md). |
| Shared code both changed (`src/components/ui`, `src/theme`, `src/lib`, `package.json`)                    | Merge both by hand: keep the base's fix and the app's additions (for example new tokens on both sides).                                             |

`git add` each resolved file. Ask the user only when a conflict is a real product decision.

## 4. Verify, then commit

1. Dependencies changed → `npm install`, then `npx expo install --check` (fix with `npx expo install --fix`).
2. `npm run check` must pass. Base changes can break app code (renamed components, new lint rules): fix the app
   code to follow the base's new conventions.
3. Native inputs changed (`app.json`, `app.config.ts`, packages with native code) → `npm run native:clean`, then
   rebuild. UI changed → run the app and take a screenshot (`run-app` skill).
4. `git commit --no-edit` (the message lists the merged base commits). Tell the user what came in, what you
   resolved and how, and anything not verified.

## Improvements found in an app

A fix that every app needs belongs in the base first: make it in the base, then sync it into apps. `/wrap` does
this at the end of every session (step 4 of the `wrap` skill). Because the
histories are shared, an app commit can also be moved over: in the base, `git fetch <app-path> main` and
`git cherry-pick <sha>`. Only do this for commits that contain no app-specific changes.
