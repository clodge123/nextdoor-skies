#!/usr/bin/env node
/**
 * REAL-API LOCAL HARNESS (wave 3, W3-D1 / C6 law)
 *
 * Runs the ACTUAL api/*.js serverless handlers over plain node http, so e2e
 * specs exercise REAL endpoints with zero mocked routes — the exact blind
 * spot that let the Vercel subpath-404 (docs/WAVE-3-CRITIQUE-TRIAGE.md C6)
 * survive mocked-route Playwright gates. "deploy == local" for routing:
 * the handlers parse the same `?path=` query-param form the client sends.
 *
 * The db is stubbed in-memory (identical surface to tests/posts-api.test.ts
 * makeDb) — no Neon, wave-1 law. The gazetteer loads from data/towns.
 *
 * Routing mirrors production shape:
 *   /api/posts            -> api/posts.js createHandler (in-memory db)
 *   /api/posts?path=<id>/x -> same handler (query-param route)
 *   /api/weather          -> api/weather.js default export
 *   /api/alerts           -> api/alerts.js default export
 *   /api/probe            -> api/probe.js default export
 *
 * Usage: node scripts/api-serve.mjs <port>
 * Env:   NDS_API_PORT (fallback port source)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REACTION_EMOJIS } from '../api/posts.js';
import { createHandler, loadGazetteer } from '../api/posts.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(repoRoot, 'dist');

const port = Number(process.argv[2] ?? process.env.NDS_API_PORT ?? 43118);
if (!Number.isInteger(port) || port <= 0) {
  console.error('api-serve: pass a valid port as first argument');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// In-memory db stub — mirrors createPgDb surface (all methods async), same
// shape as tests/posts-api.test.ts. No Neon (wave-1 law).
// ---------------------------------------------------------------------------

function makeDb() {
  const posts = new Map();
  const comments = [];
  const reactions = new Map(); // `${postId}|${nickname}` -> emoji
  const flags = new Map(); // `${postId}|${nickname}` -> true
  const rates = new Map(); // key -> { count, windowStartMs }
  const snapshots = new Map(); // id -> { id, jpeg, lat, lon, zoom } (W4-D1)
  const HOUR = 3_600_000;
  return {
    posts,
    async insertPost(row) {
      posts.set(row.id, { ...row });
    },
    async getPost(id) {
      return posts.has(id);
    },
    /** W3-D3: full single-post row for the /api/posts?path=<id> detail route. */
    async getPostRow(id) {
      const p = posts.get(id);
      if (!p) return null;
      const emojis = Object.fromEntries(REACTION_EMOJIS.map((e) => [e, 0]));
      for (const [key, emoji] of reactions) {
        if (key.startsWith(`${id}|`)) emojis[emoji] = (emojis[emoji] ?? 0) + 1;
      }
      return {
        ...p,
        commentsCount: comments.filter((c) => c.postId === id).length,
        reactionCount: [...reactions.keys()].filter((k) => k.startsWith(`${id}|`)).length,
        flagCount: [...flags.keys()].filter((k) => k.startsWith(`${id}|`)).length,
        emojis,
      };
    },
    async listPosts(town) {
      return [...posts.values()]
        .filter((p) => p.town === town)
        .map((p) => {
          const emojis = Object.fromEntries(REACTION_EMOJIS.map((e) => [e, 0]));
          for (const [key, emoji] of reactions) {
            if (key.startsWith(`${p.id}|`)) emojis[emoji] = (emojis[emoji] ?? 0) + 1;
          }
          return {
            ...p,
            commentsCount: comments.filter((c) => c.postId === p.id).length,
            reactionCount: [...reactions.keys()].filter((k) => k.startsWith(`${p.id}|`)).length,
            flagCount: [...flags.keys()].filter((k) => k.startsWith(`${p.id}|`)).length,
            emojis,
          };
        });
    },
    async listComments(postId) {
      return comments
        .filter((c) => c.postId === postId)
        .map((c) => ({ id: c.id, author: c.author, text: c.text, createdAt: c.createdAt }));
    },
    async insertComment(row) {
      comments.push({ ...row });
    },
    async getReaction(postId, nickname) {
      return reactions.get(`${postId}|${nickname}`) ?? null;
    },
    async addReaction(postId, nickname, emoji) {
      reactions.set(`${postId}|${nickname}`, emoji);
    },
    async removeReaction(postId, nickname) {
      reactions.delete(`${postId}|${nickname}`);
    },
    async myReactions(postIds, nickname) {
      const m = new Map();
      for (const id of postIds) {
        const e = reactions.get(`${id}|${nickname}`);
        if (e) m.set(id, e);
      }
      return m;
    },
    async insertFlag(postId, nickname) {
      flags.set(`${postId}|${nickname}`, true);
    },
    async flagCount(postId) {
      return [...flags.keys()].filter((k) => k.startsWith(`${postId}|`)).length;
    },
    async bumpRate(key, _bucket, nowDate) {
      // Harness law: rate limiting is unit-tested (posts-api.test.ts); the
      // e2e harness relaxes it (1000/hour) so multi-project spec runs are
      // never throttled by shared-IP counters. Routing/dispatch fidelity to
      // production is what this harness proves.
      const t = nowDate.getTime();
      let e = rates.get(key);
      if (!e || t - e.windowStartMs > HOUR) e = { count: 0, windowStartMs: t };
      e.count += 1;
      rates.set(key, e);
      return { allowed: e.count <= 1000, count: e.count };
    },
    // W4-D1: stored snapshot JPEGs (in-memory bytea).
    async insertSnapshot({ id, jpeg, lat, lon, zoom }) {
      snapshots.set(id, { id, jpeg, lat, lon, zoom });
    },
    async getSnapshot(id) {
      return snapshots.get(id) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Handler wiring
// ---------------------------------------------------------------------------

const gazetteer = await loadGazetteer();
const postsDb = makeDb();
const postsHandler = createHandler({ db: postsDb, gazetteer, now: () => new Date() });
const snapshotHandler = createSnapshotHandler({ db: postsDb, gazetteer });

async function loadDefault(name) {
  const mod = await import(`../api/${name}.js`);
  return mod.default;
}

const weatherHandler = await loadDefault('weather');
const alertsHandler = await loadDefault('alerts');
const probeHandler = await loadDefault('probe');
// W4-D1: POST /api/snapshot + GET /api/snapshots?path=<id> (query-param
// routing law; the Vercel /api/snapshots/<id> path-param file is the
// production-only twin of the same handler).
import { createHandler as createSnapshotHandler } from '../api/snapshot.js';

/** Wrap a node ServerResponse in the {status, json, setHeader} shim the
 *  serverless handlers expect (same shape as tests/posts-api.test.ts). */
function adapt(res) {
  return {
    statusCode: 200,
    _headers: {},
    setHeader(k, v) {
      this._headers[k] = v;
      try {
        res.setHeader(k, v);
      } catch {
        /* header already sent */
      }
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    // Binary response (W4-D1: GET snapshot JPEG). Headers come from
    // setHeader calls made before end().
    end(body) {
      if (!res.headersSent) {
        res.writeHead(this.statusCode, this._headers);
      }
      res.end(body);
      return this;
    },
    json(obj) {
      const body = Buffer.from(JSON.stringify(obj), 'utf8');
      if (!res.headersSent) {
        res.writeHead(this.statusCode, {
          ...this._headers,
          'content-type': 'application/json',
          'content-length': body.length,
          'access-control-allow-origin': '*',
        });
      }
      res.end(body);
      return this;
    },
  };
}

function routeFor(url) {
  const p = url.pathname;
  // Production-shaped dispatch (C6): Vercel filesystem routing sends ONLY the
  // exact /api/posts file to the function; subpaths /api/posts/<id>/<action>
  // never reach it (they 404). The supported per-post form is the query-param
  // route /api/posts?path=<id>/<action>. Mirror that exactly here so mocked-
  // route blind spots die: a client using the old subpath form FAILS locally
  // just like production.
  if (p === '/api/posts') return postsHandler;
  if (p === '/api/weather') return weatherHandler;
  if (p === '/api/alerts') return alertsHandler;
  if (p === '/api/probe') return probeHandler;
  if (p === '/api/snapshot') return snapshotHandler;
  if (p === '/api/snapshots') return snapshotHandler;
  return null;
}

// ---------------------------------------------------------------------------
// Static + SPA rewrite (mirrors vercel.json: /api/* hits handlers, everything
// else serves index.html — so /feed routes exactly like production).
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname.replace(/^\/+/, ''));
  if (!rel) rel = 'index.html';
  const file = resolve(DIST, rel);
  const inDist = file === DIST || file.startsWith(DIST + sep);
  if (!inDist) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  if (existsSync(file) && !extname(file)) {
    // directory-ish path: fall through to SPA index
  } else if (existsSync(file)) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
    return;
  }
  const idx = join(DIST, 'index.html');
  if (existsSync(idx)) {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(readFileSync(idx));
    return;
  }
  res.writeHead(503, { 'content-type': 'text/plain' });
  res.end('dist not built — run: npx vite build (root config)');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const handler = routeFor(url);
  if (!handler) {
    if (url.pathname.startsWith('/api/')) {
      // Mirrors production: unmatched api/* paths 404 (no SPA rewrite).
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    serveStatic(url.pathname, res);
    return;
  }
  try {
    // Vercel serverless shape: handlers receive `req.query` (parsed search
    // params) alongside req.url. Plain node http gives only req.url, so
    // synthesize the same surface — api/alerts.js reads req.query.bbox, and
    // without this the harness 400s where production 200s (a harness
    // blind spot of the C6 class — exactly what this server exists to kill).
    req.query = Object.fromEntries(url.searchParams);
    await handler(req, adapt(res));
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    } else {
      res.end();
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[api-serve] real api handlers on http://127.0.0.1:${port} (in-memory db, gazetteer towns=${gazetteer.size})`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
