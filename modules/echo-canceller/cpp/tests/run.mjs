// Builds and runs the desktop echo-canceller check (ec_test.c) with the system C compiler (macOS:
// Xcode's clang). Usage from the repo root: node modules/echo-canceller/cpp/tests/run.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cpp = join(here, '..');
const out = mkdtempSync(join(tmpdir(), 'echo-canceller-'));
const binary = join(out, 'ec_test');

execFileSync(
  'cc',
  ['-O2', join(here, 'ec_test.c'), join(cpp, 'echo_cancel.c'), '-lm', '-o', binary],
  { stdio: 'inherit' },
);
execFileSync(binary, [out], { stdio: 'inherit' });
console.log(`WAV files to listen to: ${out}`);
