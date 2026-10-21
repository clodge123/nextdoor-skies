import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCommitAuthors,
  checkFunctionCount,
  checkEnvVar,
  checkMigration,
  runPreflight,
  FUNCTION_CAP,
  EXPECTED_AUTHOR_EMAIL,
} from '../scripts/deploy-preflight.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaSql = readFileSync(join(root, 'db/schema.sql'), 'utf8');

// ---------- schema SQL parse tests ----------
describe('db/schema.sql', () => {
  const TABLES = ['reports', 'comments', 'flags', 'reactions', 'rate_limit'];

  it('creates all five tables idempotently (CREATE TABLE IF NOT EXISTS)', () => {
    for (const t of TABLES) {
      expect(schemaSql, `CREATE TABLE IF NOT EXISTS ${t}`).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${t}\\s*\\(`, 'i')
      );
    }
    // no destructive statements
    expect(schemaSql).not.toMatch(/DROP\s+TABLE/i);
    expect(schemaSql).not.toMatch(/TRUNCATE/i);
  });

  it('reports has the required columns', () => {
    const m = schemaSql.match(/CREATE TABLE IF NOT EXISTS reports\s*\(((?:[^()]|\([^()]*\))*)\)/is);
    expect(m).toBeTruthy();
    const body = m[1].toLowerCase();
    for (const col of ['id', 'lat', 'lon', 'text', 'type', 'ts', 'author_token_hash', 'seeded', 'created_at']) {
      expect(body, `reports.${col}`).toContain(col);
    }
    expect(body).toMatch(/primary key/);
    expect(body).toMatch(/double precision/); // lat/lon
    expect(body).toMatch(/timestamptz/);
    expect(body).toMatch(/default false/); // seeded
    expect(body).toMatch(/default now\(\)/); // created_at
  });

  it('comments references reports(id)', () => {
    const m = schemaSql.match(/CREATE TABLE IF NOT EXISTS comments\s*\(((?:[^()]|\([^()]*\))*)\)/is);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/REFERENCES\s+reports\s*\(\s*id\s*\)/i);
    expect(m[1].toLowerCase()).toContain('report_id');
  });

  it('indexes are idempotent (CREATE INDEX IF NOT EXISTS)', () => {
    expect(schemaSql).not.toMatch(/CREATE INDEX\s+(?!IF NOT EXISTS)/i);
  });
});

// ---------- preflight check tests (mocked git/env/fs) ----------
describe('preflight: commit-author check', () => {
  it('passes when every author email is the law email', () => {
    const git = (args) => {
      expect(args).toEqual(['log', '--format=%ae']);
      return `${EXPECTED_AUTHOR_EMAIL}\n${EXPECTED_AUTHOR_EMAIL}\n`;
    };
    const r = checkCommitAuthors({ git });
    expect(r.ok).toBe(true);
  });

  it('fails when any author email differs', () => {
    const git = () => `${EXPECTED_AUTHOR_EMAIL}\neve@evil.example\n`;
    const r = checkCommitAuthors({ git });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('eve@evil.example');
  });

  it('fails when git log throws', () => {
    const r = checkCommitAuthors({ git: () => { throw new Error('not a repo'); } });
    expect(r.ok).toBe(false);
  });
});

describe('preflight: function-count check', () => {
  it('passes at the cap', () => {
    const files = Array.from({ length: FUNCTION_CAP }, (_, i) => `api/f${i}.js`);
    expect(checkFunctionCount({ files }).ok).toBe(true);
  });

  it('fails one over the cap', () => {
    const files = Array.from({ length: FUNCTION_CAP + 1 }, (_, i) => `api/f${i}.js`);
    const r = checkFunctionCount({ files });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('13');
  });

  it('counts api/**/*.js recursively against the real repo (probe.js present)', () => {
    const r = checkFunctionCount({ root });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/1 api function\(s\)/); // only api/probe.js today
  });
});

describe('preflight: env-audit check', () => {
  it('passes when vercel env ls lists POSTGRES_URL', () => {
    const r = checkEnvVar({
      vercelAvailable: () => true,
      vercelEnvLs: () => 'Environment Variables\nProduction\n  POSTGRES_URL   Encrypted   2w ago',
      env: {},
    });
    expect(r.ok).toBe(true);
  });

  it('passes when local env has POSTGRES_URL even if ls omits it', () => {
    const r = checkEnvVar({
      vercelAvailable: () => true,
      vercelEnvLs: () => 'Environment Variables\nProduction\n  SOMETHING_ELSE   Encrypted   2w ago',
      env: { POSTGRES_URL: 'postgres://x' },
    });
    expect(r.ok).toBe(true);
  });

  it('fails when vercel is available and POSTGRES_URL is absent everywhere', () => {
    const r = checkEnvVar({
      vercelAvailable: () => true,
      vercelEnvLs: () => 'Environment Variables\nProduction\n  FOO   Encrypted',
      env: {},
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('POSTGRES_URL');
  });

  it('skips gracefully when vercel CLI is unavailable', () => {
    const r = checkEnvVar({ vercelAvailable: () => false, env: {} });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('skipped');
  });
});

describe('preflight: migrate-check', () => {
  it('passes when db/migrate.mjs --check exits 0', () => {
    const r = checkMigration({ run: () => '[migrate --check] OK: all 5 tables present' });
    expect(r.ok).toBe(true);
  });

  it('fails when migrate --check exits non-zero', () => {
    const err = Object.assign(new Error('exit 1'), { stdout: '', stderr: '[migrate --check] MISSING tables: reports' });
    const r = checkMigration({ run: () => { throw err; } });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('MISSING tables');
  });
});

describe('preflight: aggregate', () => {
  const allPass = {
    git: () => `${EXPECTED_AUTHOR_EMAIL}\n`,
    files: ['api/probe.js'],
    vercelAvailable: () => false,
    env: {},
    run: () => 'ok',
  };
  const allPassDeps = { root, ...allPass };

  it('runPreflight aggregates to ok=true when every check passes', () => {
    const { ok, results } = runPreflight(allPassDeps);
    expect(ok).toBe(true);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('runPreflight is NO-GO when one check fails', () => {
    const { ok, results } = runPreflight({ ...allPassDeps, git: () => 'bad@x.io\n' });
    expect(ok).toBe(false);
    expect(results.find((r) => r.name === 'commit-author').ok).toBe(false);
  });
});
