// W4-BF: GET /api/snapshots?path=<id> — the query-param GET route.
// Production routing law (C6): Vercel dispatches ONLY exact api/*.js files,
// so the stored-snapshot URL that ships inside every post (`/api/snapshots
// ?path=<id>`) needs this file to exist. Before this file, that URL hit a
// bare 404 in production (the only snapshot files were api/snapshot.js and
// api/snapshots/[id].js) and the composer died with "snapshot fetch failed"
// (owner bug-fix critique 2026-10-23). Delegates to api/snapshot.js's
// createHandler GET branch — same handler, same DB, same shapes as tests.
import { createHandler } from './snapshot.js';
import { loadGazetteer, createPgDb } from './posts.js';

export default async function handler(req, res) {
  const gazetteer = await loadGazetteer();
  if (!globalThis.__ndsPool) {
    if (!process.env.POSTGRES_URL) return res.status(500).json({ error: 'POSTGRES_URL not set' });
    const { default: pg } = await import('pg');
    globalThis.__ndsPool = new pg.Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  const handle = createHandler({ db: createPgDb(globalThis.__ndsPool), gazetteer });
  return handle(req, res);
}
