# Releasing: testers, stores and OTA updates

Delivery runs on **EAS** (Expo Application Services): cloud builds (no Xcode needed), automatic code-signing
credentials, store submission, over-the-air updates, and workflows. The free plan covers a solo developer's
regular builds; check expo.dev/pricing for current limits.

## Concepts

| Variant (`APP_VARIANT`) | EAS build profile                      | Bundle ID      | Installed as     | Update channel |
| ----------------------- | -------------------------------------- | -------------- | ---------------- | -------------- |
| `development`           | `development`, `development-simulator` | `<id>.dev`     | "<Name> Dev"     | `development`  |
| `preview`               | `preview` (internal distribution, APK) | `<id>.preview` | "<Name> Preview" | `preview`      |
| `production`            | `production` (store)                   | `<id>`         | "<Name>"         | `production`   |

All three can be installed side by side on one phone.

- **Runtime version = native fingerprint.** An OTA update only reaches builds whose native layer matches. Change
  anything native (packages with native code, `app.json` plugins/permissions/icons, SDK upgrade) → new build.
- **Versions:** `expo.version` in `app.json` is the user-facing version (bump it per store release). Build numbers
  are managed remotely by EAS and auto-incremented for production builds.

## One-time setup

1. Expo account: `npx eas-cli@latest login`
2. Link the project: `npx eas-cli@latest init` (writes `owner` and `extra.eas.projectId` into `app.json`). If
   your Expo login has several accounts, set `"owner"` in `app.json` first so the project lands in the right one;
   non-interactively it needs `--non-interactive --force` to create the project.
3. Enable OTA updates: `npx eas-cli@latest update:configure` (writes `updates.url` into `app.json`). It also
   rewrites `eas.json`: it reformats it and gives `development-simulator` its own `development-simulator` channel,
   although that profile already inherits `channel: development` via `extends`. Undo that with
   `git checkout eas.json`; only the `app.json` change is needed. It can also write **resolved** config back into
   `app.json` (seen with a config plugin that adds Android permissions: `android.permissions`,
   `extra.appVariant: "production"`, `extra.router`). Delete those: the only keys you need are `owner`,
   `extra.eas.projectId` and `updates.url`.
4. Commit `app.json`.
5. **Apple** (iOS): enroll in the Apple Developer Program (paid, yearly). On your first iOS build, EAS logs into
   your Apple account and creates/stores certificates and provisioning profiles for you. On first submit it can
   create the App Store Connect app record. What's per **team** (done once, reused by every app): registered
   devices and the distribution certificate. What's per **app** (created by EAS on the app's first iOS build):
   the App ID (bundle identifier) and its provisioning profiles.
6. **Google** (Android): create a Google Play Console account (one-time fee) and the app. Google requires the
   **first** upload to be done manually: run `npm run build:production -- --platform android`, download the
   `.aab`, upload it in Play Console. Then create a service account key for automated submissions and add it to
   EAS (`npx eas-cli@latest credentials` → Android → Google Service Account), or set
   `submit.production.android.serviceAccountKeyPath` in `eas.json` (keep the JSON file out of git).

## Everyday recipes

```bash
# Testers install directly (no review). iOS devices must be registered first: npx eas-cli@latest device:create
npm run build:preview -- --platform all

# TestFlight + Google Play internal testing (builds both, submits both)
npm run release

# JS-only fix to people already on the production build
npm run update:production -- --message "Fix crash on empty list"

# Let EAS decide: new native fingerprint → build + submit; otherwise → OTA update
npm run deploy

# What's happening?
npx eas-cli@latest status
```

Roll back a bad OTA update: `npx eas-cli@latest update:rollback` (or republish a previous update with
`update:republish`).

## First preview build (once per app)

Proves the whole delivery path before real testers depend on it. Verified on the base on 2026-11-11. You need
to be at the keyboard for the iOS steps (Apple login prompts), so run those in your own terminal.

1. EAS linked and updates configured (one-time setup, steps 1–4 above).
2. **Android:** `npm run build:preview -- --platform android --no-wait`. EAS creates the app's keystore itself,
   even with `--non-interactive`, so this needs no input.
3. **iPhone, first time only (per Apple team):** `npx eas-cli@latest device:create` → **Website** → open the
   link/QR code on the iPhone and install the profile. Turn on **Developer Mode** on the iPhone (Settings →
   Privacy & Security → Developer Mode; the phone restarts), which ad hoc apps need. If the switch isn't there
   yet, it appears after the first attempt to open an ad hoc app.
4. **iOS:** `npm run build:preview -- --platform ios`. Log in to Apple when asked; let EAS create the
   distribution certificate (or reuse the team's) and the ad hoc provisioning profile with your devices in it.
   Register new devices later? Run `device:create` again, then a new iOS build so the profile includes them.
5. **Install:** open each build's page on expo.dev on the device (iPhone: Safari → Install; Android: download
   the APK, or `adb install` it on an emulator). Check the app opens and **Settings → Update** says "Embedded
   bundle".
6. **OTA:** once the builds have finished (see below), make a small visible JS change,
   `npm run update:preview -- --message "…"`, then on each device
   force-quit and reopen the app **twice**. The first launch downloads the update in the background; the second
   runs it, and **Settings → Update** shows the update ID instead of "Embedded bundle". Revert the test change
   in git afterwards.

What to expect:

- **An update only reaches builds made before it.** A build ignores any update older than the JS bundle built
  into it (its log says "No update available" even though the server has one). So for this check, publish the
  update **after** the build has finished; in normal use that's exactly what you want, since a newer build
  already contains that code.
- **Free plan queues differ by platform, and builds take a while.** iOS took ~6 minutes in total; Android
  waited ~40 minutes in the queue, then took ~25 minutes to build. Each cloud build starts on a fresh machine,
  so later builds aren't much faster; the way to save time is not to build: JS changes ship as OTA updates in
  about a minute, and only native changes need a new build. Start builds with `--no-wait` and check `npx eas-cli@latest build:list`. Live queue
  times: https://expo.dev/eas-build-status. In a hurry and only testing on your own devices? Add `--local` to
  build on this Mac (needs the native toolchain; no install page or build history on expo.dev, so not for
  testers).
- **`com.example…` IDs work for internal builds.** Apple registered `com.example.base.preview` without
  complaint. They still have to change before any store upload.
- **One update, one group per platform.** iOS and Android have different fingerprints, so `eas update` prints a
  separate runtime version and update group for each. If an update never arrives, compare the build's runtime
  version (`npx eas-cli@latest build:view <id>`, or the build page) with the one `eas update` printed for that
  platform. They differ when something native changed since the build: make a new build. Local `ios/` and
  `android/` folders don't affect it (they're git-ignored, so the fingerprint skips them).
- **Heavy native libraries can run the free Android builder out of memory.** With Skia, an audio engine and
  Reanimated, Gradle compiles C++ for four ABIs in parallel and the build dies with "Gradle build daemon
  disappeared unexpectedly". For internal (APK) builds, build only what phones use: add
  `"ORG_GRADLE_PROJECT_reactNativeArchitectures": "arm64-v8a"` to the `preview` profile's `env` (it also covers
  the emulator on Apple Silicon). Store builds need `arm64-v8a,x86_64` at least; if they hit the same wall, try
  that or a larger `resourceClass` (paid).
- **Reading a failed build's log without the website:** `npx eas-cli@latest build:view <id> --json` lists
  `logFiles` (signed URLs, valid ~15 minutes). They're Brotli-compressed: `curl -s <url> | brotli -dc`, one JSON
  object per line with the text in `msg`.

## Store release checklist

**Both stores**

- [ ] Final bundle ID / package (not `com.example…`) — it can never change after the first upload.
- [ ] App icon and splash (see `docs/new-app-checklist.md`).
- [ ] Privacy policy URL (required by both stores, even for apps without accounts).
- [ ] Screenshots (iPhone 6.9" required; iPad if you support tablets; Android phone).
- [ ] If users can create accounts: in-app account deletion is required.
- [ ] If you offer third-party sign-in (Google, Facebook…) on iOS, also offer Sign in with Apple.

**App Store Connect**: description, keywords, support URL, age rating, App Privacy ("nutrition label"), review
notes + demo account if login is required. Export compliance is pre-answered (`usesNonExemptEncryption: false`
in `app.json`; change it if you add custom encryption).

**Play Console**: store listing, Data safety form, content rating questionnaire, target audience, app access
(demo credentials), and for new personal developer accounts a closed test with testers before production access.

Optional: manage App Store listing text as code with EAS Metadata (`store.config.json`, `eas metadata:push`).

## Automation

- **GitHub Actions** (`.github/workflows/ci.yml`): `npm run check` + bundle both platforms on every push/PR.
- **EAS Workflows** (`.eas/workflows/`), run on Expo's infrastructure:
  - `create-development-builds.yml` — dev builds for Android, iOS device and iOS simulator.
  - `create-preview-builds.yml` — internal tester builds.
  - `deploy-production.yml` — fingerprint → build + submit **or** OTA update. Run with `npm run deploy`.

  Run any of them with `npx eas-cli@latest workflow:run .eas/workflows/<file>.yml`. Whenever you edit them,
  check them with `npx eas-cli@latest workflow:validate .eas/workflows/<file>.yml` (needs an Expo login). To
  trigger them from GitHub pushes, connect the repo in the project's GitHub settings on expo.dev and uncomment
  the `on:` block.

**One EAS project per app.** The base may be linked to its own EAS project (handy for trying builds and
workflows on the base itself); `create-app` / `new-app` remove that link (`owner`, `extra.eas`, `updates.url`)
so each new app gets its own project via `npx eas-cli@latest init`.
