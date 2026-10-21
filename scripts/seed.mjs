#!/usr/bin/env node
/**
 * L7 seed CLI runner.
 *
 * Usage:
 *   node scripts/seed.mjs                      # uses POSTGRES_URL, then REPORTS_FILE from env
 *   REPORTS_FILE=./tmp/reports.json node scripts/seed.mjs
 *   POSTGRES_URL=postgres://... node scripts/seed.mjs
 *
 * Seed-once: exits 0 and reports "already seeded" when data exists.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, '../dist/server/lib/seed.js');
const srcEntry = resolve(here, '../server/lib/seed.ts');

async function loadSeed() {
  try {
    await access(distEntry);
    return await import(distEntry);
  } catch {
    console.error('dist/server/lib/seed.js not found — run `npm run build` first.');
    process.exit(1);
  }
}

const { seedOnce } = await loadSeed();

const opts = { now: new Date() };
if (process.env.POSTGRES_URL) opts.postgresUrl = process.env.POSTGRES_URL;
if (process.env.REPORTS_FILE) opts.reportsFile = process.env.REPORTS_FILE;

try {
  const result = await seedOnce(opts);
  if (result.seeded) {
    console.log(`seeded: ${result.posts} demo posts, ${result.comments} demo comments`);
  } else {
    console.log(`not seeded (${result.reason}; ${result.posts} existing posts)`);
  }
} catch (err) {
  console.error('seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
