#!/usr/bin/env node
/**
 * Runs the Maestro E2E flows in .maestro/ against the app on a simulator/emulator/device.
 *
 *   npm run e2e                                  # development build (needs `npm start` running)
 *   npm run e2e -- --platform android            # ANDROID_SERIAL=… to pick a specific Android device
 *   npm run e2e -- --variant preview             # a preview/production build, no bundler needed
 *   npm run e2e -- --flow .maestro/smoke.yaml    # a single flow
 *
 * The app ID is derived from app.json + the variant suffix, so flows stay identity-agnostic.
 * Screenshots and debug output go to .artifacts/maestro/<platform>/.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { adb, androidSerial, bootedIosSimulator, offlineAndroidEntries } from './lib/devices.mjs';

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    variant: { type: 'string', default: 'development' },
    flow: { type: 'string', default: '.maestro' },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

const suffix = { development: '.dev', preview: '.preview', production: '' }[values.variant];
if (suffix === undefined) {
  fail(`Unknown --variant "${values.variant}" (development | preview | production)`);
}
if (!existsSync(values.flow)) fail(`No flow found at ${values.flow}`);

const maestro = [join(homedir(), '.maestro/bin/maestro'), 'maestro'].find((bin) => {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
if (!maestro) fail('Maestro is not installed. Run: bash scripts/setup-mac.sh tools');

const platform = values.platform ?? (bootedIosSimulator() ? 'ios' : 'android');
const deviceId = platform === 'ios' ? bootedIosSimulator() : androidSerial();
if (!deviceId) {
  fail(`No running ${platform} simulator/emulator/device. Start one with \`npm run ${platform}\`.`);
}

// Maestro (both platforms) first scans localhost:5555–5683 for Android emulators and waits forever for
// an adb reply from anything listening there. A non-emulator app on one of those ports makes every run
// hang right after "Using SLF4J…" in ~/.maestro/tests/*/maestro.log. ADB_LOCAL_TRANSPORT_MAX_PORT
// doesn't help: Maestro's built-in adb client (dadb) has the range hard-coded.
const blockers = portBlockers();
if (blockers.length > 0) {
  console.warn(
    [
      `⚠ Not an emulator, but listening where Maestro looks for one: ${blockers.join(', ')}.`,
      '  Maestro will hang before connecting. Quit that app (e.g. `pkill NTKDaemon` for Native',
      '  Instruments), then run again.\n',
    ].join('\n'),
  );
}

const offline = platform === 'android' ? offlineAndroidEntries() : [];
if (offline.length > 0) {
  console.warn(
    [
      `⚠ adb also lists offline device(s): ${offline.join(', ')} — Maestro may then see no devices at all.`,
      '  Usually another app listening on a port in 5555–5585 (e.g. Native Instruments NTKDaemon on 5563).',
      '  Fix for adb: adb kill-server && ADB_LOCAL_TRANSPORT_MAX_PORT=5561 adb start-server',
      '  (Maestro itself still hangs until that app is quit; see the warning above.)\n',
    ].join('\n'),
  );
}

const { expo } = JSON.parse(readFileSync('app.json', 'utf8'));
const baseId = platform === 'ios' ? expo.ios.bundleIdentifier : expo.android.package;
const appId = `${baseId}${suffix}`;

// Development builds load JS from the local bundler through the dev client's deep link.
let devClientUrl = '';
if (values.variant === 'development') {
  let status = '';
  try {
    status = execFileSync('curl', ['-s', '--max-time', '2', 'http://localhost:8081/status'], {
      encoding: 'utf8',
    });
  } catch {
    // not running
  }
  if (!status.includes('packager-status:running')) {
    fail('The bundler is not running. Start it in another terminal with `npm start`.');
  }
  if (platform === 'android') {
    // Lets the emulator/phone reach the Mac's bundler at localhost:8081.
    execFileSync(adb, ['-s', deviceId, 'reverse', 'tcp:8081', 'tcp:8081'], { stdio: 'ignore' });
  }
  // Same launch URL format Expo CLI uses; the __expo_disable_* params keep the dev menu from covering the app.
  devClientUrl =
    `exp+${expo.slug}://?__expo_url=${encodeURIComponent('http://localhost:8081')}` +
    '&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1';
}

console.log(
  `Maestro → ${platform} (${deviceId}) · ${appId}${devClientUrl ? ' · dev client' : ''}\n`,
);
const result = spawnSync(
  maestro,
  [
    'test',
    '--platform',
    platform,
    '--udid',
    deviceId,
    '--test-output-dir',
    `.artifacts/maestro/${platform}`,
    '-e',
    `APP_ID=${appId}`,
    '-e',
    `DEV_CLIENT_URL=${devClientUrl}`,
    values.flow,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);

/** `name (pid) on :port` for every non-emulator process listening on Maestro's emulator ports. */
function portBlockers() {
  let output = '';
  try {
    output = execFileSync('lsof', ['-nP', '-iTCP:5555-5683', '-sTCP:LISTEN', '-Fcpn'], {
      encoding: 'utf8',
    });
  } catch {
    return []; // lsof exits 1 when nothing listens
  }
  const found = [];
  let pid = '';
  let command = '';
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1);
    else if (line.startsWith('c')) command = line.slice(1);
    else if (line.startsWith('n') && !/qemu|emulator|adb/i.test(command)) {
      found.push(`${command} (pid ${pid}) on ${line.slice(1).replace(/^.*:/, ':')}`);
    }
  }
  return [...new Set(found)];
}
