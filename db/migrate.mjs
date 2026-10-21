#!/usr/bin/env node
// db/migrate.mjs — apply db/schema.sql to POSTGRES_URL, then verify tables.
// Modes:
//   node db/migrate.mjs          -> apply schema (idempotent), verify, exit 0/1
//   node db/migrate.mjs --check  -> verify ONLY (no writes); exit 0 if all tables exist, 1 otherwise
// Requires POSTGRES_URL in env. Uses the `pg` dependency.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const EXPECTED_TABLES = ['reports', 'comments', 'flags', 'reactions', 'rate_limit'];

function die(msg) {
  console.error(`[migrate] ${msg}`);
  process.exit(1);
}

const checkMode = process.argv.includes('--check');
const url = process.env.POSTGRES_URL;
if (!url) die('POSTGRES_URL is not set (required for migration/verification)');

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, 'schema.sql');
let schemaSql;
try {
  schemaSql = readFileSync(schemaPath, 'utf8');
} catch (err) {
  die(`cannot read ${schemaPath}: ${err.message}`);
}

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (err) {
  die(`cannot connect to POSTGRES_URL: ${err.message}`);
}

async function verifyTables() {
  const res = await client.query(
    'select table_name from information_schema.tables where table_schema = any(current_schemas(false)) and table_name = any($1::text[])',
    [EXPECTED_TABLES]
  );
  const found = new Set(res.rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
  return missing;
}

let exitCode = 0;
try {
  if (checkMode) {
    const missing = await verifyTables();
    if (missing.length) {
      console.error(`[migrate --check] MISSING tables: ${missing.join(', ')}`);
      exitCode = 1;
    } else {
      console.log(`[migrate --check] OK: all ${EXPECTED_TABLES.length} tables present (${EXPECTED_TABLES.join(', ')})`);
    }
  } else {
    console.log('[migrate] applying db/schema.sql (idempotent)...');
    await client.query(schemaSql);
    const missing = await verifyTables();
    if (missing.length) {
      console.error(`[migrate] schema applied but tables missing: ${missing.join(', ')}`);
      exitCode = 1;
    } else {
      console.log(`[migrate] OK: schema applied, all ${EXPECTED_TABLES.length} tables verified`);
    }
  }
} catch (err) {
  die(`migration failed: ${err.message}`);
} finally {
  try { await client.end(); } catch { /* ignore */ }
}
process.exit(exitCode);
