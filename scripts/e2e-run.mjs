#!/usr/bin/env node
/**
 * L2 harness runner: ensures deps exist, then runs the Playwright suite.
 * Usage: node scripts/e2e-run.mjs [playwright args...]
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pwCli = join(repoRoot, '.e2e', 'node_modules', '@playwright', 'test', 'cli.js');
if (!existsSync(pwCli)) {
  console.error('[e2e-run] @playwright/test not installed. Run: node scripts/e2e-setup.mjs');
  process.exit(1);
}
const res = spawnSync(process.execPath, [pwCli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: repoRoot,
  env: {
    ...process.env,
    // Node 24 honors env proxies (NODE_USE_ENV_PROXY); keep all localhost
    // traffic (webServer health-check, baseURL) off the egress proxy.
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  },
});
process.exit(res.status ?? 1);
