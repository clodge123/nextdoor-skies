#!/usr/bin/env node
// scripts/deploy-preflight.mjs — deploy-gate preflight (R16).
// Checks (all four run; exit non-zero if any fail):
//   1. commit-author: every commit author email is clodge123@users.noreply.github.com
//   2. function-count: api/**/*.js count <= 12 (Hobby cap)
//   3. env-audit: POSTGRES_URL present when `vercel env ls` is available
//   4. migrate-check: node db/migrate.mjs --check exits 0
// Usage: node scripts/deploy-preflight.mjs [--json]
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTHOR_EMAIL = 'clodge123@users.noreply.github.com';
export const FUNCTION_CAP = 12;
export const EXPECTED_AUTHOR_EMAIL = AUTHOR_EMAIL;

const repoRoot = () => join(dirnameOf(import.meta.url), '..');
function dirnameOf(metaUrl) {
  const p = fileURLToPath(metaUrl);
  return p.slice(0, p.lastIndexOf('/'));
}

// --- check 1: commit authors -------------------------------------------------
export function checkCommitAuthors({ root = repoRoot(), git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }) } = {}) {
  let emails;
  try {
    emails = git(['log', '--format=%ae']).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    return { name: 'commit-author', ok: false, detail: `git log failed: ${err.message}` };
  }
  if (!emails.length) return { name: 'commit-author', ok: false, detail: 'no commits found' };
  const bad = [...new Set(emails.filter((e) => e !== AUTHOR_EMAIL))];
  return bad.length
    ? { name: 'commit-author', ok: false, detail: `invalid author email(s): ${bad.join(', ')} (law: ${AUTHOR_EMAIL})` }
    : { name: 'commit-author', ok: true, detail: `${emails.length} commit(s), all authored by ${AUTHOR_EMAIL}` };
}

// --- check 2: function count -------------------------------------------------
export function listApiFunctions({ root = repoRoot() } = {}) {
  const apiDir = join(root, 'api');
  const out = [];
  if (!existsSync(apiDir)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith('.js')) out.push(relative(root, full));
    }
  };
  walk(apiDir);
  return out.sort();
}

export function checkFunctionCount({ root = repoRoot(), files = listApiFunctions({ root }) } = {}) {
  const n = files.length;
  return n <= FUNCTION_CAP
    ? { name: 'function-count', ok: true, detail: `${n} api function(s) (cap ${FUNCTION_CAP})` }
    : { name: 'function-count', ok: false, detail: `${n} api functions exceed cap ${FUNCTION_CAP}: ${files.join(', ')}` };
}

// --- check 3: env audit ------------------------------------------------------
export function checkEnvVar({
  root = repoRoot(),
  env = process.env,
  vercelAvailable = () => {
    try { execFileSync('which', ['vercel'], { encoding: 'utf8' }); return true; } catch { return false; }
  },
  vercelEnvLs = () => execFileSync('vercel', ['env', 'ls'], { cwd: root, encoding: 'utf8' }),
} = {}) {
  if (!vercelAvailable()) return { name: 'env-audit', ok: true, detail: 'vercel CLI not available; skipped (local run)' };
  let out;
  try {
    out = vercelEnvLs();
  } catch (err) {
    return { name: 'env-audit', ok: false, detail: `vercel env ls failed: ${err.message}` };
  }
  const declared = /(^|\n)\s*POSTGRES_URL(\s|$)/.test(out) || out.includes('POSTGRES_URL');
  const localSet = Boolean(env.POSTGRES_URL);
  if (!declared && !localSet) {
    return { name: 'env-audit', ok: false, detail: 'POSTGRES_URL not present in `vercel env ls` output and not set in local env' };
  }
  return { name: 'env-audit', ok: true, detail: `POSTGRES_URL present (${declared ? 'vercel env ls' : 'local env'})` };
}

// --- check 4: migration check ------------------------------------------------
export function checkMigration({ root = repoRoot(), run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } = {}) {
  try {
    const out = run('node', ['db/migrate.mjs', '--check']);
    return { name: 'migrate-check', ok: true, detail: out.trim().split('\n').pop() || 'ok' };
  } catch (err) {
    const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    return { name: 'migrate-check', ok: false, detail: `db/migrate.mjs --check failed: ${out.trim() || err.message}` };
  }
}

export function runPreflight(deps = {}) {
  const results = [
    checkCommitAuthors(deps),
    checkFunctionCount(deps),
    checkEnvVar(deps),
    checkMigration(deps),
  ];
  return { ok: results.every((r) => r.ok), results };
}

// CLI entry
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = process.argv.includes('--json');
  const { ok, results } = runPreflight();
  if (json) {
    console.log(JSON.stringify({ ok, results }, null, 2));
  } else {
    for (const r of results) console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}: ${r.detail}`);
    console.log(ok ? 'preflight: GO — all checks passed' : 'preflight: NO-GO — fix failures before deploy');
  }
  process.exit(ok ? 0 : 1);
}
