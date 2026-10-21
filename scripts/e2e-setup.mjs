#!/usr/bin/env node
/**
 * L2 harness setup: installs @playwright/test + vite into the isolated .e2e/
 * deps dir (root package.json is L1-owned — base64-encoded, npm cannot parse
 * it — so the harness never touches it), symlinks node_modules for module
 * resolution, then installs the Chromium browser. Run once per machine/CI.
 *
 * Usage: node scripts/e2e-setup.mjs [--with-deps]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, rmSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const e2eDir = join(repoRoot, '.e2e');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function npmRun(args, cwd) {
  console.log(`[e2e-setup] npm ${args.join(' ')}`);
  const res = spawnSync(npm, args, { stdio: 'inherit', cwd });
  if (res.status !== 0) {
    console.error(`[e2e-setup] npm ${args.join(' ')} failed (${res.status})`);
    process.exit(res.status ?? 1);
  }
}

mkdirSync(e2eDir, { recursive: true });
npmRun(['install', '--no-audit', '--no-fund'], e2eDir);

// Symlink repo-root node_modules -> .e2e/node_modules (module resolution).
const nm = join(repoRoot, 'node_modules');
try {
  const st = lstatSync(nm);
  if (st.isSymbolicLink() || st.isDirectory()) rmSync(nm, { recursive: true, force: true });
} catch {
  /* absent */
}
symlinkSync('.e2e/node_modules', nm);

const pwCli = join(e2eDir, 'node_modules', 'playwright-core', 'cli.js');
if (!existsSync(pwCli)) {
  console.error('[e2e-setup] playwright CLI missing after install');
  process.exit(1);
}
const browserArgs = ['install', 'chromium'];
if (process.argv.includes('--with-deps')) browserArgs.push('--with-deps');
const res = spawnSync(process.execPath, [pwCli, ...browserArgs], { stdio: 'inherit', cwd: repoRoot });
if (res.status !== 0) process.exit(res.status ?? 1);

console.log('[e2e-setup] done. Run: node scripts/e2e-run.mjs');
