// TEMPORARY wave-2 migration endpoint (wave-1 pattern): applies db/schema.sql
// to POSTGRES_URL, verifies EXPECTED_TABLES, then this file is deleted.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const url = process.env.POSTGRES_URL;
if (!url) { console.error('POSTGRES_URL not set'); process.exitCode = 1; return { ok: false }; }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
try {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  const found = new Set((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(r => r.table_name));
  const expected = ['reports','comments','flags','reactions','rate_limit','posts','post_comments','post_reactions','post_flags'];
  const missing = expected.filter(t => !found.has(t));
  console.log(JSON.stringify({ ok: missing.length === 0, migrated: expected.filter(t => found.has(t)), missing }));
  return { ok: missing.length === 0, missing };
} finally { await pool.end(); }
