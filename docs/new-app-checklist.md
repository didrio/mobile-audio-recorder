# New app checklist

From this base to your own app. The `new-app` agent skill walks through the same steps.

## Who does what

| You                                                                                             | The agent                                                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| The idea, the app name, the bundle ID (permanent once on a store)                               | Plans it with you, builds, tests, screenshots, keeps `TICKETS.md` |
| Icon and splash artwork (iOS icon in Apple's Icon Composer)                                     | Wires the artwork and colors into `app.json` and the theme        |
| At the keyboard for the Apple login on the app's first iOS build; `device:create` per new phone | Android builds, emulator installs, preview OTA updates            |
| Accounts and fees (Apple Developer, Play Console), store listings, privacy policy URL           | Store checklists and metadata drafts                              |
| Approving anything public: store submissions, production updates, pushes                        | Asks before any of those                                          |

Devices and the Apple distribution certificate set up for an earlier app are reused; each new app only adds its
own App ID and provisioning profile (EAS creates them on the first iOS build).

## 1. Create it

```bash
# from the base repo: clones the base (with its history) into a new folder, renames it, commits, installs
npm run create-app -- ../habit-tracker --name "Habit Tracker"

# recommended: a private GitHub repo for the app (CI + backup; /wrap pushes every session once it exists)
cd ../habit-tracker && gh repo create habit-tracker --private --source . --remote origin && git push -u origin main
```

Bundle IDs default to `com.didrio.<slug>` (`config.bundleIdPrefix` in the base's `package.json`); pass
`--id com.didrio.something` to choose another. `create-app` sets the name, slug, URL scheme, iOS bundle ID and
Android package (`app.json`), the package name and the README title/intro, removes the base's EAS project link,
and starts a fresh `TICKETS.md`. It commits that on top of the base's history and keeps the base as the `base`
remote, so the app can pull later base improvements (section 5). Only committed base changes are included. Then
open the folder in Claude Code (Opus, high effort, plan mode on) and run `/start T1`: that session works through
the rest of this checklist with you.

- **Cloned the base yourself** (instead of `create-app`)? Run `npm run new-app -- --name "Habit Tracker"` in the
  clone. If `origin` still points at the base's repository, it tells you to rename it to `base` so `/wrap` never
  pushes the app into the base.
- **Renaming later:** `npm run new-app -- --name "New Name"` (and/or `--id …`) inside the app only changes what
  you pass; `TICKETS.md`, the version and the EAS link stay. The slug can't change once EAS is linked.

## 2. Make it yours

- [ ] **Brand colors**: `brand` / `primary` in `src/theme/tokens.ts` (light + dark).
- [ ] **iOS icon** (iOS 26+ layered icon): design it in Apple's **Icon Composer** and replace `assets/app.icon/`.
- [ ] **Fallback / Android-legacy icon**: `assets/images/icon.png`, 1024×1024 PNG, no transparency.
- [ ] **Android adaptive icon**: `assets/images/android-icon-foreground.png` (+ `-background`, `-monochrome`),
      1024×1024, keep the artwork inside the central ~66% safe zone; set `android.adaptiveIcon.backgroundColor`.
- [ ] **Dev / preview icons**: `assets/images/variants/` (`icon-<dev|preview>.png` 1024×1024 no transparency,
      `android-foreground-*` / `android-monochrome-*` inside the central ~66%). Optional: restyle the neutral
      DEV / PREVIEW labels to the app's look, so the builds are easy to tell apart on a home screen.
- [ ] **Splash**: `assets/images/splash-icon.png` (a centered logo, transparent background) and the light/dark
      background colors in the `expo-splash-screen` plugin in `app.json`.
- [ ] **Home screen**: replace `src/features/home` with your first real screen; update its test and
      `.maestro/smoke.yaml`.
- [ ] **README**: one paragraph on what the app is.
- [ ] **Orientation / tablets**: `orientation` in `app.json`; add `"ios": { "supportsTablet": true }` only if you
      design for iPad (it adds iPad screenshot requirements).

## 3. Connect services

- [ ] GitHub repo (if not created in section 1): `gh repo create <slug> --private --source . --remote origin`,
      then `git push -u origin main`. CI (`.github/workflows/ci.yml`) runs on every push.
- [ ] `npx eas-cli@latest init` and `npx eas-cli@latest update:configure`, then the first preview build and OTA
      check: "First preview build (once per app)" in `docs/releasing.md`. `/start T1` adds a ticket for it.
- [ ] Backend: set `EXPO_PUBLIC_API_URL` in `.env` (copy `.env.example`) and for EAS (`eas env:create`).
- [ ] Optional: crash reporting (Sentry), analytics, auth provider — add when the app needs them.

## 4. Before the first store submission

Follow the store checklist in `docs/releasing.md`.

## 5. Keep up with the base

The base keeps improving (agent skills, scripts, docs, design-system fixes, SDK upgrades). Because an app made
with `create-app` shares the base's git history, those improvements arrive with a normal git merge:

```bash
npm run sync-base -- --dry-run   # which base commits and files would come in
npm run sync-base                # merge base/main; stops before committing
npm run check && git commit --no-edit
```

- **What's protected:** `TICKETS.md` always stays the app's. Everything else is a 3-way merge: base changes to
  files the app never touched apply cleanly, and real overlaps (e.g. `app.json`, a screen the app replaced) show
  up as conflicts. A lockfile-only conflict is regenerated automatically. Agents resolve with the `sync-base`
  skill (`.claude/skills/sync-base/SKILL.md`); `git merge --abort` undoes a sync.
- **When:** whenever the base has something you want, and before starting a big feature. Sync an Expo SDK
  upgrade in its own session.
- **Fix it in the base:** a fix every app needs goes into the base first and then into each app with
  `sync-base`. Shared history also lets you cherry-pick a clean app commit into the base:
  `git fetch ../habit-tracker main && git cherry-pick <sha>` (run in the base).
- **Base moved to GitHub?** `git remote set-url base git@github.com:you/base.git` in each app.
- **App made without `create-app`** (e.g. cloned the base, then `new-app`): add the remote once with
  `npm run sync-base -- --base <path-or-url>`. If the app has a fresh history (GitHub "Use this template", a
  copy), connect it once to the base commit it was created from, without changing any files:
  `git fetch base && git merge -s ours --allow-unrelated-histories -m "Adopt base history" <base-sha>`. After that,
  `sync-base` brings in only what changed in the base since then.
