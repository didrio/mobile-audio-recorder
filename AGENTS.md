# AGENTS.md

Operating manual for coding agents working in this repo. Humans: see README.md.

This is a cross-platform **iOS + Android app** built with **Expo SDK 58** (React Native 0.88, React 19.3,
TypeScript 6, New Architecture, Hermes, React Compiler). It started from a reusable "base" template, so it is
deliberately small, conventional, and fully wired: navigation, theming, data layer, tests, E2E, CI, app variants,
cloud builds, store submission and OTA updates.

## Golden rules

1. **Your training data is out of date for this stack.** Expo/RN APIs change every SDK. Before using an
   Expo/RN/router API you're not certain of, check the installed types in `node_modules/<pkg>/build/*.d.ts` or
   the versioned docs `https://docs.expo.dev/versions/v58.0.0/` (index for agents:
   `https://docs.expo.dev/llms.txt`). Examples already bitten in this repo: `headerLargeTitle` →
   `headerLargeTitleEnabled`; `Appearance.setColorScheme('auto')` (not `null`/`'unspecified'`); RNTL v14
   `render`/`fireEvent` are **async**; `eas update` requires `--environment`.
2. **Add runtime packages with `npx expo install <pkg>`**, never `npm install <pkg>` (it pins SDK-compatible
   versions). Dev-only tools: `npm install -D`.
3. **Never create or edit `ios/` or `android/`.** They're generated (Continuous Native Generation) and
   git-ignored. Native config goes in `app.json` (+ config plugins). See `docs/native.md`.
4. **Use the npm scripts**, not raw `expo` commands — they set `APP_VARIANT` correctly.
5. **Definition of done:** `npm run check` passes (typecheck + lint + format + tests), and UI changes were
   looked at on a simulator/emulator when one is available (`npm run screenshot`). Say clearly what you could not
   verify.
6. **Follow the structure and conventions below**; don't introduce a parallel pattern (another styling library,
   state manager, folder scheme) without the user asking. `docs/decisions.md` explains the choices.
7. **Ask before outward-facing actions**: store submissions, production OTA updates, `eas` commands that publish,
   anything that costs money or is visible to users. One standing exception: `/wrap` publishes a **preview** OTA
   update when it can reach the installed preview builds (see the `wrap` skill).
8. When a feature needs a native module that **isn't in Expo Go**, tell the user it requires a development build
   (and how to get one) before writing the code.

## Commands

| Task                                          | Command                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| All checks (run before finishing)             | `npm run check`                                                                                                         |
| Typecheck / lint / autofix / format           | `npm run typecheck` · `npm run lint` · `npm run lint:fix` · `npm run format`                                            |
| Unit tests                                    | `npm test` · `npm test -- src/features/home` · `npm run test:watch`                                                     |
| What can this machine run?                    | `npm run doctor`                                                                                                        |
| Run on iOS Simulator / Android emulator       | `npm run ios` · `npm run android` (dev build, starts bundler)                                                           |
| Run on a USB device                           | `npm run ios:device` · `npm run android:device`                                                                         |
| Bundler only (dev build installed)            | `npm start`                                                                                                             |
| Run in Expo Go (no native toolchain)          | `npm run start:go` (`-- --tunnel` if the phone is on another network)                                                   |
| Screenshot the running simulator/emulator     | `npm run screenshot` → prints a PNG path; open it to look                                                               |
| E2E (Maestro)                                 | `npm run e2e` (bundler must be running for dev builds)                                                                  |
| Regenerate native projects                    | `npm run native:clean` (after native config/dependency changes)                                                         |
| Inspect resolved app config                   | `npx expo config --type public` (prefix `APP_VARIANT=…` to switch)                                                      |
| Expo dependency health                        | `npm run doctor:expo` · fix versions: `npx expo install --fix`                                                          |
| Cloud builds / release / OTA                  | `npm run build:dev` · `build:dev:sim` · `build:preview` · `release` · `update:preview` · `update:production` · `deploy` |
| Can an OTA update reach the installed builds? | `node scripts/ota-check.mjs` (preview) · `node scripts/ota-check.mjs production` (read-only)                            |
| Pull improvements from the base template      | `npm run sync-base -- --dry-run` · `npm run sync-base` (merges `base/main`, doesn't commit; see `sync-base` skill)      |

Skills with step-by-step playbooks live in `.claude/skills/` (plain Markdown — any agent can read them):
`start`, `wrap`, `ticket` (the session workflow below), `new-app`, `add-feature`, `add-native-capability`,
`run-app`, `release`, `sync-base`. Claude Code also gets Expo's official plugin (`expo@claude-plugins-official`: Expo/EAS
skills + the Expo MCP server). Use the MCP server for docs search and EAS build/workflow status; for seeing and
driving the app keep `npm run screenshot` + Maestro (the MCP device automation was unreliable; see `run-app`).

## How work flows: tickets and sessions

Work is planned in **`TICKETS.md`**, an ordered, living backlog (T1, T2, …), and done **one ticket per session**:

1. **`/start T5`** (or `/start` to get a recommendation): read `TICKETS.md`, then only the files the ticket
   points to, and work toward its **Done when** checklist.
2. **`/ticket …`** at any point captures new ideas or scope creep as tickets instead of growing the current one.
3. **`/wrap`**: final checks, update `TICKETS.md` (outcomes, handoff notes, new tickets, the **Next:** pick with
   recommended model, effort and plan mode), commit, and print the next session's steps. The user then runs
   `/clear` and starts the next session.

Whoever wraps a session has the most context, so they write the handoff. That keeps every new session small,
focused and cheap. Without slash commands, follow `.claude/skills/<name>/SKILL.md` when asked to start or wrap.
Keep the user oriented throughout: say what's done, and suggest the next step or command.

## Working efficiently

The aim is the best ratio of quality to cost and time, with the user in the loop.

- **Context is the main cost.** Read what the task needs, not the whole repo; prefer targeted searches over
  dumping large files. Start new tickets in fresh sessions.
- **Fast checks while working, the full check at the end**: `npm run typecheck`, `npm test -- <path>` during the
  work; `npm run check` before wrapping.
- **Screenshots cost tokens.** Take them when the UI changed, of the screens that changed, not after every edit.
- **Rebuild native only when native inputs changed** (packages with native code, `app.json` plugins or
  permissions). JS changes hot-reload.
- **Spend more where it pays off**: data model, navigation structure, native setup, auth and anything else that's
  expensive to change later deserve more thought and a plan; routine UI work doesn't.

## Project map

```
src/
  app/                    Expo Router routes ONLY — file = URL. Keep these files thin.
    _layout.tsx           Root: providers, root Stack, ErrorBoundary, one-time startup work
    +not-found.tsx
    (tabs)/_layout.tsx    Native tab bar (NativeTabs: Liquid Glass on iOS, Material 3 on Android)
    (tabs)/(home)/        Home tab: _layout.tsx (Stack) + index.tsx
    (tabs)/settings/      Settings tab: _layout.tsx (Stack) + index.tsx
  features/<feature>/     Screens + feature components, hooks, api.ts, stores, tests (colocated)
  components/ui/          Design-system primitives: Text, Button, Screen, Card, Icon, ListSection/ListRow, SegmentedControl
  components/             App-level components (AppProviders, ErrorScreen)
  lib/                    Infrastructure: api-client, query-client, storage, env, app-info
  theme/                  Tokens (colors, spacing, radius, typography), useTheme, makeStyles
assets/                   App icon (assets/app.icon = iOS 26 Icon Composer), Android adaptive icon, splash
.maestro/                 E2E flows (YAML) + subflows/
scripts/                  doctor, setup-mac.sh, screenshot, e2e, ota-check, new-app, create-app, sync-base (Node, no deps);
                          lib/ (identity, devices), templates/TICKETS.md (fresh backlog for new apps)
.eas/workflows/           EAS Workflows: dev builds, preview builds, production deploy
.github/workflows/ci.yml  CI: npm run check + bundle both platforms
app.json                  App identity & static native config (single source of truth; tools write here)
app.config.ts             Derives dev/preview/production variants from APP_VARIANT
eas.json                  Build profiles, channels, submit config
docs/                     getting-started, architecture, native, releasing, new-app-checklist, decisions
TICKETS.md                Ordered, living backlog; one ticket per session (/start → /wrap)
```

## Conventions

- **Routes are thin**: `export { FooScreen as default } from '@/features/foo/foo-screen';`. Screen options go
  in the tab's `_layout.tsx` (`<Stack.Screen name="…" options={{ title }} />`).
- **Files** kebab-case (`settings-screen.tsx`), **components** PascalCase named exports (default exports only
  where Expo Router requires them). Import across folders via `@/…` (`@/assets/…` for assets).
- **Styling**: `const useStyles = makeStyles((t) => ({ … }))` at the bottom of the file, using `t.colors.*`
  (semantic names), `t.spacing.*`, `t.radius.*`. No hex colors or font sizes in features — add tokens in
  `src/theme/tokens.ts` (both light and dark). Use `Text variant=… color=…`, not RN `Text` (lint enforces
  this, plus `expo-image` over RN `Image` and safe-area-context over RN `SafeAreaView`).
- **Icons**: `<Icon name={{ ios: 'gearshape', android: 'settings' }} />` (SF Symbols + Material Symbols; both
  required). Tab icons: `NativeTabs.Trigger.Icon sf=… md=…`.
- **State**: server data → TanStack Query; shared client state → zustand (persist via `zustandStorage` only if
  it must survive restarts); local → `useState`. Don't copy server data into zustand.
- **Storage**: `@/lib/storage` (sync KV on SQLite) for preferences; `expo-secure-store` for secrets;
  `expo-sqlite` for structured data.
- **API**: `api.get(path, zodSchema)` from `@/lib/api-client` — every response is validated; errors are
  `ApiError` / `ApiResponseError`. Base URL from `EXPO_PUBLIC_API_URL` (`src/lib/env.ts`).
- **Env vars**: only `EXPO_PUBLIC_*` reach the app, inlined at build time (never secrets). Add to `.env.example`
  and `src/lib/env.ts`.
- **React Compiler is on**: don't sprinkle `useMemo`/`useCallback`/`memo` for performance; follow the Rules of
  React (lint flags violations).
- **Accessibility**: interactive elements get `accessibilityRole` and a label (visible text counts). Tests query
  by role/text, which keeps this honest.
- **Tests** are colocated `*.test.ts(x)`. This project uses `@testing-library/react-native` v14, whose APIs can
  differ from your training data: before writing or changing RNTL tests, read
  `node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`. Native modules are mocked at the
  boundary in `jest.setup.ts`. Some packages ship agent docs too, e.g.
  `node_modules/expo-sqlite/skills/expo-sqlite/SKILL.md`.

## Verification loop

1. `npm run check` — fix everything it reports (the format hook already formats files you edit).
2. If you touched UI and a simulator/emulator is available (`npm run doctor`): make sure the app is running
   (`npm run ios` / `npm run android`, in the background), let it reload, then `npm run screenshot` and **look
   at the image**. Check dark mode too when relevant.
3. Maestro (`npm run e2e`) and the other platform's emulator are for **milestones** (preview/store builds,
   releases, native or dependency changes), not every ticket: while iterating, the user tries changes right
   away. Driving the simulator with a throwaway Maestro flow to see your own work is fine any time.
4. Changed native config or dependencies? `npm run native:clean` then rebuild; also run
   `npx expo export --platform ios --platform android --output-dir /tmp/export` to prove both bundles build.
5. Report what you verified and what you couldn't (e.g. "no Android emulator on this machine").

## Gotchas

- **Two clocks**: the JS and UI-thread (worklet) runtimes don't share a `performance.now()` origin (seen ~29 h
  apart on iOS). Don't pass a JS timestamp to a worklet as-is; measure the offset with `runOnUISync` from
  `react-native-worklets` (UI `performance.now()` minus the JS reading taken around the call) and convert.
- **Shared values moved on the UI thread**: don't read-modify-write them from a JS-side `useEffect`
  (`sv.set(clamp(sv.get(), …))`). The JS read can be stale and writes an old value back over what a gesture or
  `useAnimatedReaction` just set. Do the read-modify-write in a worklet: `scheduleOnUI(() => { 'worklet'; … })`.
- **Worklet functions aren't hoisted**: the worklets Babel plugin turns a `'worklet'` function declaration into
  a const, so calling one declared further down the file fails with "is not a function" (Jest included).
  Declare worklet helpers above their callers.
- **Android headers**: `Stack.Toolbar.Button` renders **nothing** on Android unless `icon` is an image source
  (no SF Symbols, no text; only a dev warning). Give Android a `headerRight` with a Pressable + `Icon` instead.
  And Android's Material header is opaque: content padding for iOS 26's floating header (`useHeaderHeight()`)
  must be iOS-only, or Android gets a blank band under the header.
- **Variants**: `APP_VARIANT` = `development` (local scripts, `.dev` bundle ID, "<Name> Dev"), `preview`,
  `production` (default when unset). Switching variants for local native builds needs `npm run native:clean`.
- **Base updates**: apps share the base's git history (`base` remote) and pull its improvements with
  `npm run sync-base`. Generic fixes (tooling, skills, design-system bugs) belong in the base first; app-specific
  edits to base-owned files (`.claude/`, `scripts/`, `docs/`, configs) will need re-applying at merge time.
- **OTA updates** only reach builds with the same runtime fingerprint. Native changes ⇒ new build. The
  fingerprint also covers `package.json` **scripts**: adding or changing an npm script needs a new build too
  (so helper scripts are run with `node scripts/…`). `node scripts/ota-check.mjs` says whether an update reaches
  the latest builds.
- **Expo Go** supports only the latest SDK and only its bundled native modules. `expo-dev-client` is installed,
  so `npm start` targets dev builds; use `npm run start:go` for Expo Go.
- **Typed routes**: `npm run typecheck` regenerates the route types (`.expo/types`) before running `tsc`, so new
  routes are known without the dev server. Plain `npx tsc` can see stale routes.
- Installed-but-unused capabilities ready to use: `@expo/ui` (SwiftUI / Jetpack Compose components),
  `expo-glass-effect` (Liquid Glass views), `expo-web-browser`, `expo-device`, `expo-haptics`, `expo-image`.
- Web is intentionally not a target (`platforms: ["ios", "android"]`). Adding it later:
  `npx expo install react-dom react-native-web` and add `"web"` to `platforms`.
