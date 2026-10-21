#!/usr/bin/env node
/**
 * L2 harness selftest: proves the console-error collector FAILS tests.
 * Runs the probe spec (tests/harness-probe) in its own Playwright process
 * and asserts exit code != 0 with the console error named in the output.
 * Usage: node scripts/e2e-selftest.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pwCli = join(repoRoot, '.e2e', 'node_modules', '@playwright', 'test', 'cli.js');
if (!existsSync(pwCli)) {
  console.error('[e2e-selftest] @playwright/test not installed. Run: node scripts/e2e-setup.mjs');
  process.exit(1);
}

const res = spawnSync(
  process.execPath,
  [
    pwCli,
    'test',
    '-c',
    'tests/harness-probe/playwright.probe.config.ts',
    '--project=desktop',
    '--reporter=list',
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    },
  },
);

const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
const failed = res.status !== 0 && res.status !== null;
const caught = /console errors during test[\s\S]*harness-selftest: deliberate boom/.test(output);

if (failed && caught) {
  console.log('[e2e-selftest] PASS — console error correctly failed the probe test.');
  process.exit(0);
}
console.error(
  `[e2e-selftest] FAIL — expected probe run to exit nonzero with collector message. ` +
    `exit=${res.status} caught=${caught}\n--- output ---\n${output.slice(-3000)}`,
);
process.exit(1);
