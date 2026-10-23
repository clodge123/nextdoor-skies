// W4 SNAPSHOT-COMPOSITOR — GET /api/snapshots/<id> (Vercel path-param route).
// Serves the stored JPEG with immutable cache headers. Delegates to the
// shared GET logic in api/snapshot.js via the ?path= query-param form (the
// harness/proxy shape); this file exists so the literal path route works on
// Vercel filesystem routing (C6 law: exact files dispatch, subpaths don't).
import { createHandler, loadGazetteer } from './snapshot.js';
import { createPgDb } from '../posts.js';

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
  const id = req.query?.id ?? '';
  req.method = 'GET';
  req.url = `/api/snapshots?path=${encodeURIComponent(id)}`;
  return handle(req, res);
}
