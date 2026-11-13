---
name: run-app
description: Launch this app on an iOS Simulator, Android emulator, real device or Expo Go, then see and drive it — screenshots, logs, and Maestro E2E flows. Use when asked to run, start, open, preview, screenshot, test on device, or confirm a change works in the real app.
---

# Run the app and verify it visually

## 0. Know what this machine can do

```bash
npm run doctor        # ✓/○ per target: Expo Go, iOS Simulator, Android emulator, devices, EAS, Maestro
```

## 1. Launch

| Target                        | Command                                                                       | Notes                                                                                                                                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS Simulator (dev build)     | `npm run ios` (specific device: `npm run ios -- --device "iPhone 18 Pro"`)    | Uses the booted simulator, else the saved default. First run compiles natively (several minutes). Xcode 27+: the simulator app is DeviceHub — `open "devices://device/open?id=<udid>"`.                                                                                           |
| Android emulator (dev build)  | `npm run android`                                                             | Boots the emulator if none is running. Fails with `device 'emulator-5554' not found` after building? The emulator died on its quick-boot snapshot: `$ANDROID_HOME/emulator/emulator -avd <name> -no-snapshot-load &`, wait for `adb shell getprop sys.boot_completed` = 1, rerun. |
| Real iPhone (USB, dev build)  | `npm run ios:device`                                                          | Needs Xcode signing (free Apple ID works for personal devices).                                                                                                                                                                                                                   |
| Real Android (USB, dev build) | `npm run android:device`                                                      | USB debugging enabled.                                                                                                                                                                                                                                                            |
| Real phone, zero setup        | `npm run start:go` → user scans the QR with **Expo Go**                       | Only Expo Go-compatible modules. Phone and Mac on the same Wi-Fi (else `-- --tunnel`).                                                                                                                                                                                            |
| Dev build already installed   | `npm start` → press `i` / `a`                                                 | Just starts the bundler.                                                                                                                                                                                                                                                          |
| No local toolchain            | `npm run build:dev:sim` (iOS sim) / `npm run build:dev -- --platform android` | Cloud build via EAS; needs `eas init`.                                                                                                                                                                                                                                            |

Run long-lived commands (`npm start`, `npm run ios`) in the background and poll their output; the bundler must
keep running while you test. After native changes (new native package, app.json plugins/permissions), rebuild
with `npm run native:clean && npm run ios|android`. JS/TS changes hot-reload automatically; press `r` in the
bundler terminal for a full reload.

## 2. See it

```bash
npm run screenshot            # prints the PNG path → open it with your image-reading tool
npm run screenshot -- ios home-dark
```

Check both light and dark mode (Settings tab → Appearance) and, for layout work, both platforms.

## 3. Drive it

- Maestro flows in `.maestro/` (YAML: `tapOn`, `inputText`, `assertVisible`, `takeScreenshot`).
  `npm run e2e` (needs `npm start` running for dev builds) or `npm run e2e -- --flow .maestro/<flow>.yaml`.
  Screenshots from flows (`takeScreenshot: <name>`) land in
  `.artifacts/maestro/<platform>/<run>/<Flow>/takeScreenshot/<name>.png`. A fresh dev-build install would
  normally open the dev menu over the app; `scripts/e2e.mjs` launches with the `__expo_disable_*` URL params
  so flows see the app itself.
- Expo MCP local automation (`npm run start:mcp`: screenshot / tap / find view / logs) is **not** part of the
  default loop. Tried on the iOS simulator (T5): with the bundler running and the app loaded, its screenshot,
  find-view and log tools failed with "No platform found" (the app never attached to the MCP tunnel), while
  `npm run screenshot` takes ~2 s and always works. Coordinate taps did work (iOS points, not image pixels).
  Stick to `npm run screenshot` + Maestro. Revisit if Expo stabilises it (it is `EXPO_UNSTABLE_*`).
- The **cloud-side** MCP tools are worth using: `search_documentation` / `read_documentation` (cheap, versioned
  Expo docs lookup), `build_list` / `build_info` / `workflow_list` (EAS status without leaving the session),
  and `expo_router_sitemap` (route list while the bundler runs). Authenticate once via `/mcp`.

## 4. Logs

- JS logs and errors stream in the bundler output. Red-box errors show in the app.
- iOS native: `xcrun simctl spawn booted log stream --predicate 'process == "<AppName>"' --level error`.
- Android native: `adb logcat '*:E' | grep -i <package>`.

## 5. Report honestly

If no simulator/emulator/device is available, say so and fall back to `npm run check` plus a bundling check:
`npx expo export --platform ios --platform android --output-dir /tmp/export`. Don't claim visual verification
you couldn't do.
