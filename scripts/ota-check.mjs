#!/usr/bin/env node
/**
 * Can the current code reach the installed builds of a channel as an over-the-air (OTA) update?
 * Compares this checkout's runtime fingerprint (runtimeVersion policy "fingerprint") with the latest
 * finished EAS build on the channel, per platform. Read-only: it publishes nothing.
 *
 *   node scripts/ota-check.mjs               # preview channel (the default)
 *   node scripts/ota-check.mjs production
 *
 * Prints one line per platform and exits with:
 *   0  every platform with a build matches: `npm run update:<channel>` reaches them
 *   1  a platform's fingerprint differs: native changed, it needs a new build (the others can still OTA)
 *   2  can't tell: EAS not linked, not logged in, or no finished build on the channel
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const channel = process.argv[2] ?? 'preview';
const variant = channel === 'production' ? 'production' : 'preview';

const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
if (!appJson.expo?.extra?.eas?.projectId) {
  console.log('EAS is not linked (no expo.extra.eas.projectId in app.json): no OTA possible yet.');
  process.exit(2);
}

function run(command, args, env = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, ...env },
  });
}

function localFingerprint(platform) {
  const out = run('npx', ['expo-updates', 'fingerprint:generate', '--platform', platform], {
    APP_VARIANT: variant,
  });
  return JSON.parse(out).hash;
}

function latestBuild(platform) {
  const out = run('npx', [
    '--yes',
    'eas-cli@latest',
    'build:list',
    '--channel',
    channel,
    '--platform',
    platform,
    '--status',
    'finished',
    '--limit',
    '1',
    '--json',
    '--non-interactive',
  ]);
  const [build] = JSON.parse(out);
  return build ?? null;
}

let differs = false;
let unknown = false;
for (const platform of ['ios', 'android']) {
  let build;
  let local;
  try {
    build = latestBuild(platform);
    local = localFingerprint(platform);
  } catch {
    console.log(`${platform}: couldn't check (logged in to EAS? \`npx eas-cli@latest whoami\`)`);
    unknown = true;
    continue;
  }
  if (!build) {
    console.log(`${platform}: no finished ${channel} build yet`);
    unknown = true;
    continue;
  }
  const installed = build.runtime?.version ?? build.runtimeVersion;
  const commit = (build.gitCommitHash ?? '').slice(0, 7);
  if (installed === local) {
    console.log(`${platform}: OTA ok (runtime ${local.slice(0, 8)}, build from ${commit})`);
  } else {
    console.log(
      `${platform}: NEEDS A NEW BUILD (native changed: build ${String(installed).slice(0, 8)} from ${commit}, now ${local.slice(0, 8)})`,
    );
    differs = true;
  }
}
process.exit(differs ? 1 : unknown ? 2 : 0);
