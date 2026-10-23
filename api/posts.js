// W4 POSTS-API — wave 2 (docs/WAVE-2-CONTRACTS.md S2/S3/S4/S8).
// ONE serverless function, query-param/path routed:
//   GET  /api/posts?town=<slug>&sort=hot|new   -> { posts: [...] }
//   POST /api/posts  { town, text, snapshot? } -> 201 | 401 | 413 | 415 | 429
//   GET  /api/posts/:id/comments               -> [ {id, author, text, createdAt} ]
//   POST /api/posts/:id/comments { text }      -> 201 (session required)
//   POST /api/posts/:id/reactions { emoji }    -> toggle (session required)
//   POST /api/posts/:id/flag                   -> hidden after 3 distinct flags
//
// Determinism law (R17): no Math.random / Date.now / new Date in app logic.
// The process-edge default export reads the wall clock ONCE per request via
// `now()` (the documented server edge — same precedent as server/lib/seed.ts
// CLI); every createdAt comes from the server, never the client. Ids are
// content-hashed (FNV-1a), deterministic. Tests inject `now` + `db` + gazetteer.
//
// Session (S1): x-nds-session header = JSON-encoded { nickname, townSlug,
// townName }. Nickname 2-24 chars, sanitized (no HTML); town slug must exist
// in the baked gazetteer (data/towns/us-towns.json).
//
// Routing note: vercel.json rewrites /api/posts/<id>/<action> to
// /api/posts?path=<id>/<action>; this function parses the `path` param.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const RATE_LIMIT_MAX = 5; // posts per IP per hour (run-1 rate_limit table)
export const SNAPSHOT_MAX_BYTES = 120 * 1024; // S7: data URL <= 120 KB
export const TEXT_MAX = 1000;
export const COMMENT_TEXT_MAX = 500;
export const FLAG_HIDE_COUNT = 3; // hidden from feeds after 3 distinct flags
export const HOT_SCORE_MIN = 3; // hot = replies*2 + reactions*1 + recency decay
/** W4-C2 FEED-LOAD: infinite-scroll page size. The client's sentinel asks
 *  for page=2,3,...; a page shorter than this means END OF LIST (honest
 *  marker, never fake rows). Deterministic: the full sorted list is sliced,
 *  never re-queried, so pages never overlap and never skip. */
export const PAGE_SIZE = 30;
export const REACTION_EMOJIS = ['👍', '❤️', '😂'];

/** W4-D1 snapshot id shape (api/snapshot.js ids; mirrored here to avoid a
 *  circular import — snapshot.js already imports parseSession from here). */
export const SNAP_ID_RE = /^snap_[0-9a-z]+$/;

const SNAPSHOT_PREFIX = 'data:image/jpeg;base64,';

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Lowercase, non-alnum -> single dash, trimmed. Matches MapPage.slugify. */
export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Town id used by MapPage.townId: slugify(name)-<lat2dp>-<lon2dp>. */
export function townId(name, lat, lon) {
  return `${slugify(name)}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`;
}

/** FNV-1a 32-bit content hash -> base36. Deterministic id source (no RNG). */
export function hashId(prefix, ...parts) {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(36)}`;
}

/** Sanitized nickname or null. 2-24 chars, no HTML chars, trimmed. */
export function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length < 2 || s.length > 24) return null;
  if (/[<>&]/.test(s)) return null; // no HTML
  return s;
}

/** User text: strip control chars, trim, length-bound. null if empty/too long. */
export function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!s.length || s.length > max) return null;
  return s;
}

/** Check a snapshot data URL. Returns null (ok) | 'type' | 'size'. */
export function snapshotProblem(snapshot) {
  if (snapshot === undefined || snapshot === null) return null;
  if (typeof snapshot !== 'string' || !snapshot.startsWith(SNAPSHOT_PREFIX)) return 'type';
  const b64 = snapshot.slice(SNAPSHOT_PREFIX.length);
  const bytes = Buffer.from(b64, 'base64').byteLength;
  if (bytes > SNAPSHOT_MAX_BYTES) return 'size';
  return null;
}

/** Hot score: replies*2 + reactions*1 + exp(-ageHours/12) recency decay. */
export function hotScore({ commentsCount, reactionsTotal, createdAt, now }) {
  const ageMs = Math.max(0, now.getTime() - Date.parse(createdAt));
  const ageHours = ageMs / 3_600_000;
  return commentsCount * 2 + reactionsTotal + Math.exp(-ageHours / 12);
}

/** Parse + validate x-nds-session. Returns { session, error }. */
export function parseSession(req, gazetteer) {
  const raw = req.headers?.['x-nds-session'];
  if (!raw) return { session: null, error: 'missing session' };
  let s;
  try {
    s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { session: null, error: 'malformed session' };
  }
  const nickname = sanitizeNickname(s?.nickname);
  if (!nickname) return { session: null, error: 'invalid nickname' };
  const slug = typeof s?.townSlug === 'string' ? s.townSlug.trim() : '';
  if (!gazetteer.has(slug)) return { session: null, error: 'unknown town' };
  return { session: { nickname, townSlug: slug, townName: s?.townName ?? slug }, error: null };
}

// ---------------------------------------------------------------------------
// Handler factory — db, gazetteer, clock injected (tests stub all three).
// Every db method returns a Promise (plain values ok in stubs; all awaited).
// ---------------------------------------------------------------------------

export function createHandler({ db, gazetteer, now = () => new Date(), ipOf = clientIp }) {
  return async function handler(req, res) {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', 'http://local');
    const pathQ = url.searchParams.get('path');
    const pathname = pathQ ? `/api/posts/${pathQ}` : url.pathname;
    const seg = pathname.replace(/^\/api\/posts\/?/, '').split('/').filter(Boolean);

    const json = (code, obj) => res.status(code).json(obj);
    const postView = (row, myReaction) => ({
      id: row.id,
      author: row.author,
      town: row.town,
      text: row.text,
      snapshot: row.snapshot ?? null,
      snapshotId: row.snapshotId ?? null,
      lat: row.lat ?? null,
      lon: row.lon ?? null,
      zoom: row.zoom ?? null,
      createdAt: isoOf(row.createdAt),
      reactions: { '👍': 0, '❤️': 0, '😂': 0, ...(row.emojis ?? {}) },
      myReaction: myReaction ?? null,
      commentsCount: row.commentsCount,
      hot: row.hot === true,
    });

    // ---- GET /api/posts?town=&sort=&page= ----------------------------------
    // W4-E1 ALL-FEED: town is OPTIONAL. Omitting it lists EVERY town (the
    // global stream, S4 brainstorm: "Latest IS the all feed"). Same sort,
    // flag-hide, and session myReaction paths either way — no second route.
    // W4-C2 FEED-LOAD: `page` is OPTIONAL and defaults to the LEGACY
    // behavior — an absent page param returns the FULL list, byte-identical
    // to every pre-C2 response (panel/feed-all/detail consumers unchanged).
    // An explicit page=N (N>=1) slices the SAME deterministically sorted
    // list [(N-1)*PAGE_SIZE, N*PAGE_SIZE) — no overlap, no skips (sort
    // happens before slicing, id tie-break makes it stable). A junk page
    // value is a loud 400, never a silent fallback to page 1.
    if (!seg.length && method === 'GET') {
      const town = url.searchParams.get('town');
      const sort = url.searchParams.get('sort') ?? 'new';
      if (sort !== 'new' && sort !== 'hot') return json(400, { error: 'sort must be hot|new' });
      const pageRaw = url.searchParams.get('page');
      let page = 1;
      if (pageRaw !== null && pageRaw !== '') {
        const n = Number(pageRaw);
        if (!Number.isInteger(n) || n < 1) {
          return json(400, { error: 'page must be a positive integer' });
        }
        page = n;
      }
      const { session } = parseSession(req, gazetteer); // optional: myReaction only
      const rows = (await db.listPosts(town || null)).filter((r) => r.flagCount < FLAG_HIDE_COUNT);
      const mine = session ? await db.myReactions(rows.map((r) => r.id), session.nickname) : new Map();
      const stamp = now();
      const posts = rows.map((r) => {
        const score = hotScore({
          commentsCount: r.commentsCount,
          reactionsTotal: r.reactionCount,
          createdAt: isoOf(r.createdAt),
          now: stamp,
        });
        return { ...r, hot: score >= HOT_SCORE_MIN, _score: score };
      });
      if (sort === 'hot') {
        posts.sort((a, b) => Number(b.hot) - Number(a.hot) || b._score - a._score || cmpNewest(a, b));
      } else {
        posts.sort((a, b) => cmpNewest(a, b));
      }
      // W4-C2: explicit page -> deterministic slice of the sorted list.
      // Absent page -> the full list (legacy, byte-identical law).
      const view = posts.map((r) => postView(r, mine.get(r.id) ?? null));
      const body =
        pageRaw === null || pageRaw === ''
          ? { posts: view }
          : { posts: view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
      return json(200, body);
    }

    // ---- POST /api/posts ----------------------------------------------------
    if (!seg.length && method === 'POST') {
      const { session, error } = parseSession(req, gazetteer);
      if (!session) return json(401, { error });
      const body = await readJson(req);
      if (body.error) return json(body.code ?? 400, { error: body.error });
      const town = typeof body.json?.town === 'string' ? body.json.town.trim() : '';
      const text = sanitizeText(body.json?.text, TEXT_MAX);
      if (!gazetteer.has(town)) return json(400, { error: 'unknown town slug' });
      if (!text) return json(400, { error: `text required (1-${TEXT_MAX} chars)` });
      const snap = snapshotProblem(body.json?.snapshot);
      if (snap === 'type') return json(415, { error: 'snapshot must be data:image/jpeg;base64, data URL' });
      if (snap === 'size') return json(413, { error: `snapshot exceeds ${SNAPSHOT_MAX_BYTES} bytes` });
      // W4-D1: server-composited snapshot reference. snapshotId (from
      // POST /api/snapshot) must exist in the snapshots table — loud 400,
      // never a silent drop. lat/lon/zoom record the poster's view.
      // W4-D2: when the client ALSO ships an inline burned-strip JPEG
      // (wave-2 data-URL seam), that image is the render source — the
      // stored snapshot stays linked as provenance (the strip is burned
      // client-side ONCE at upload; the stored JPEG is the clean map).
      // snapshotId-only posts (API clients, seeds) render the stored
      // snapshot via GET /api/snapshots?path=<id>.
      let snapshotRef = body.json?.snapshot ?? null;
      let snapshotId = null;
      let lat = null;
      let lon = null;
      let zoom = null;
      const rawSnapId = body.json?.snapshotId;
      if (rawSnapId !== undefined && rawSnapId !== null) {
        if (typeof rawSnapId !== 'string' || !SNAP_ID_RE.test(rawSnapId)) {
          return json(400, { error: 'snapshotId must be a snapshot id (snap_*)' });
        }
        const stored = await db.getSnapshot(rawSnapId);
        if (!stored) return json(400, { error: 'unknown snapshotId' });
        snapshotId = rawSnapId;
        if (snapshotRef === null) snapshotRef = `/api/snapshots?path=${encodeURIComponent(rawSnapId)}`;
        lat = Number.isFinite(Number(body.json?.lat)) ? Number(body.json.lat) : null;
        lon = Number.isFinite(Number(body.json?.lon)) ? Number(body.json.lon) : null;
        zoom = Number.isFinite(Number(body.json?.zoom)) ? Number(body.json.zoom) : null;
      }
      const rate = await db.bumpRate(`ip:${ipOf(req)}`, 'posts', now());
      if (!rate.allowed) return json(429, { error: 'rate limited: 5 posts/hour' });
      const createdAt = now().toISOString();
      const id = hashId('p', session.nickname, town, text, createdAt);
      const row = {
        id, town, author: session.nickname, text,
        snapshot: snapshotRef,
        snapshotId, lat, lon, zoom,
        createdAt, commentsCount: 0, reactionCount: 0, flagCount: 0, emojis: {},
      };
      await db.insertPost(row);
      return json(201, { post: postView(row, null) });
    }

    // ---- /api/posts/:id/... --------------------------------------------------
    const [postId, action] = seg;
    // W3-D3: bare-id GET — the single-post route /api/posts?path=<id> used by
    // the /p/<id> detail page. Same store, same shapes as the list view; a
    // flagged-out post reads as not-found (feed law), unknown id 404s honestly.
    if (postId && !action) {
      if (method !== 'GET') return json(404, { error: 'not found' });
      const row = await db.getPostRow(postId);
      if (!row || row.flagCount >= FLAG_HIDE_COUNT) return json(404, { error: 'post not found' });
      const { session } = parseSession(req, gazetteer); // optional: myReaction only
      const mine = session ? ((await db.myReactions([postId], session.nickname)).get(postId) ?? null) : null;
      const score = hotScore({
        commentsCount: row.commentsCount,
        reactionsTotal: row.reactionCount,
        createdAt: isoOf(row.createdAt),
        now: now(),
      });
      return json(200, { post: { ...postView(row, mine), hot: score >= HOT_SCORE_MIN } });
    }

    if (action === 'comments' && method === 'GET') {
      if (!(await db.getPost(postId))) return json(404, { error: 'post not found' });
      return json(200, await db.listComments(postId));
    }
    if (action === 'comments' && method === 'POST') {
      const { session, error } = parseSession(req, gazetteer);
      if (!session) return json(401, { error });
      if (!(await db.getPost(postId))) return json(404, { error: 'post not found' });
      const body = await readJson(req);
      if (body.error) return json(body.code ?? 400, { error: body.error });
      const text = sanitizeText(body.json?.text, COMMENT_TEXT_MAX);
      if (!text) return json(400, { error: `text required (1-${COMMENT_TEXT_MAX} chars)` });
      const createdAt = now().toISOString();
      const id = hashId('c', postId, session.nickname, text, createdAt);
      const row = { id, postId, author: session.nickname, text, createdAt };
      await db.insertComment(row);
      return json(201, row);
    }
    if (action === 'reactions' && method === 'POST') {
      const { session, error } = parseSession(req, gazetteer);
      if (!session) return json(401, { error });
      if (!(await db.getPost(postId))) return json(404, { error: 'post not found' });
      const body = await readJson(req);
      if (body.error) return json(body.code ?? 400, { error: body.error });
      const emoji = body.json?.emoji;
      if (!REACTION_EMOJIS.includes(emoji)) return json(400, { error: 'emoji must be 👍|❤️|😂' });
      const current = await db.getReaction(postId, session.nickname);
      if (current === emoji) {
        await db.removeReaction(postId, session.nickname); // toggle off
      } else {
        if (current) await db.removeReaction(postId, session.nickname); // replace
        await db.addReaction(postId, session.nickname, emoji);
      }
      return json(200, { ok: true, myReaction: await db.getReaction(postId, session.nickname) });
    }
    if (action === 'flag' && method === 'POST') {
      const { session, error } = parseSession(req, gazetteer);
      if (!session) return json(401, { error });
      if (!(await db.getPost(postId))) return json(404, { error: 'post not found' });
      await db.insertFlag(postId, session.nickname);
      return json(200, { ok: true, flags: await db.flagCount(postId) });
    }

    return json(404, { error: 'not found' });
  };
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function cmpNewest(a, b) {
  const d = Date.parse(isoOf(b.createdAt)) - Date.parse(isoOf(a.createdAt));
  // Determinism law: equal timestamps tie-break by id (ascending) so the
  // order is stable regardless of db row order.
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isoOf(v) {
  return typeof v === 'string' ? v : new Date(v).toISOString();
}

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return { json: req.body };
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (raw.length > 1_500_000) return { error: 'body too large', code: 413 };
  if (!raw.length) return { json: {} };
  try {
    return { json: JSON.parse(raw.toString('utf8')) };
  } catch {
    return { error: 'invalid JSON body', code: 400 };
  }
}

// ---------------------------------------------------------------------------
// Postgres db (Neon, POSTGRES_URL) — thin repo over db/schema.sql tables
// ---------------------------------------------------------------------------

export function createPgDb(pool) {
  const q = (sql, params) => pool.query(sql, params);
  return {
    async insertPost(row) {
      await q(
        `insert into posts (id, town, author, text, snapshot, snapshot_id, lat, lon, zoom, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          row.id, row.town, row.author, row.text, row.snapshot,
          row.snapshotId ?? null, row.lat ?? null, row.lon ?? null, row.zoom ?? null,
          row.createdAt,
        ],
      );
    },
    // W4-D1: stored snapshot JPEGs (snapshots table, api/snapshot.js).
    async insertSnapshot({ id, jpeg, lat, lon, zoom }) {
      await q(
        `insert into snapshots (id, jpeg, lat, lon, zoom) values ($1,$2,$3,$4,$5)
         on conflict (id) do nothing`,
        [id, jpeg, lat, lon, zoom],
      );
    },
    async getSnapshot(id) {
      const r = await q(`select id, jpeg, lat, lon, zoom from snapshots where id = $1`, [id]);
      const x = r.rows[0];
      if (!x) return null;
      return { id: x.id, jpeg: x.jpeg, lat: x.lat, lon: x.lon, zoom: x.zoom };
    },
    async getPost(id) {
      const r = await q(`select 1 from posts where id = $1`, [id]);
      return r.rowCount > 0;
    },
    /** W3-D3: full single-post row for /api/posts?path=<id> (detail page). */
    async getPostRow(id) {
      const r = await q(
        `select p.id, p.town, p.author, p.text, p.snapshot, p.snapshot_id, p.lat, p.lon, p.zoom, p.created_at,
                (select count(*) from post_comments c where c.post_id = p.id)::int as "commentsCount",
                (select count(*) from post_reactions x where x.post_id = p.id)::int as "reactionCount",
                (select count(distinct f.nickname) from post_flags f where f.post_id = p.id)::int as "flagCount"
         from posts p where p.id = $1`,
        [id],
      );
      const x = r.rows[0];
      if (!x) return null;
      const emo = (await q(
        `select emoji, count(*)::int as n from post_reactions where post_id = $1 group by emoji`,
        [id],
      )).rows;
      const emojis = {};
      for (const e of emo) emojis[e.emoji] = e.n;
      return {
        id: x.id, town: x.town, author: x.author, text: x.text,
        snapshot: x.snapshot, snapshotId: x.snapshot_id, lat: x.lat, lon: x.lon, zoom: x.zoom,
        createdAt: x.created_at.toISOString(),
        commentsCount: x.commentsCount, reactionCount: x.reactionCount,
        flagCount: x.flagCount, emojis,
      };
    },
    async listPosts(town) {
      // W4-E1: town=null/undefined -> global list (every town). Same
      // aggregate columns; newest-first, id tie-break applied by the
      // handler's sort (determinism law).
      const where = town ? 'where p.town = $1' : '';
      const params = town ? [town] : [];
      const r = await q(
        `select p.id, p.town, p.author, p.text, p.snapshot, p.snapshot_id, p.lat, p.lon, p.zoom, p.created_at,
                (select count(*) from post_comments c where c.post_id = p.id)::int as "commentsCount",
                (select count(*) from post_reactions x where x.post_id = p.id)::int as "reactionCount",
                (select count(distinct f.nickname) from post_flags f where f.post_id = p.id)::int as "flagCount"
         from posts p ${where} order by p.created_at desc`,
        params,
      );
      const ids = r.rows.map((x) => x.id);
      const emo = ids.length
        ? (await q(
            `select post_id, emoji, count(*)::int as n from post_reactions
             where post_id = any($1) group by post_id, emoji`,
            [ids],
          )).rows
        : [];
      return r.rows.map((x) => {
        const emojis = {};
        for (const e of emo.filter((y) => y.post_id === x.id)) emojis[e.emoji] = e.n;
        return {
          id: x.id, town: x.town, author: x.author, text: x.text,
          snapshot: x.snapshot, snapshotId: x.snapshot_id, lat: x.lat, lon: x.lon, zoom: x.zoom,
          createdAt: x.created_at.toISOString(),
          commentsCount: x.commentsCount, reactionCount: x.reactionCount,
          flagCount: x.flagCount, emojis,
        };
      });
    },
    async listComments(postId) {
      const r = await q(
        `select id, author, text, created_at from post_comments
         where post_id = $1 order by created_at asc`,
        [postId],
      );
      return r.rows.map((x) => ({ id: x.id, author: x.author, text: x.text, createdAt: x.created_at.toISOString() }));
    },
    async insertComment(row) {
      await q(
        `insert into post_comments (id, post_id, author, text, created_at) values ($1,$2,$3,$4,$5)`,
        [row.id, row.postId, row.author, row.text, row.createdAt],
      );
    },
    async getReaction(postId, nickname) {
      const r = await q(`select emoji from post_reactions where post_id = $1 and nickname = $2`, [postId, nickname]);
      return r.rows[0]?.emoji ?? null;
    },
    async addReaction(postId, nickname, emoji) {
      await q(
        `insert into post_reactions (id, post_id, nickname, emoji)
         values ($1,$2,$3,$4)
         on conflict (post_id, nickname) do update set emoji = excluded.emoji`,
        [hashId('r', postId, nickname, emoji), postId, nickname, emoji],
      );
    },
    async removeReaction(postId, nickname) {
      await q(`delete from post_reactions where post_id = $1 and nickname = $2`, [postId, nickname]);
    },
    async myReactions(postIds, nickname) {
      if (!postIds.length) return new Map();
      const r = await q(
        `select post_id, emoji from post_reactions where nickname = $1 and post_id = any($2)`,
        [nickname, postIds],
      );
      return new Map(r.rows.map((x) => [x.post_id, x.emoji]));
    },
    async insertFlag(postId, nickname) {
      await q(
        `insert into post_flags (id, post_id, nickname) values ($1,$2,$3)
         on conflict (post_id, nickname) do nothing`,
        [hashId('f', postId, nickname), postId, nickname],
      );
    },
    async flagCount(postId) {
      const r = await q(`select count(distinct nickname)::int as n from post_flags where post_id = $1`, [postId]);
      return r.rows[0].n;
    },
    async bumpRate(key, bucket, nowDate) {
      // run-1 rate_limit table pattern; key = 'ip:<ip>', bucket = 'posts'.
      // Window reset uses SQL now() (server clock, not app logic).
      const r = await q(
        `insert into rate_limit (id, author_token_hash, bucket, count, window_start)
         values ($1,$2,$3,1,$4)
         on conflict (author_token_hash, bucket) do update
           set count = case when rate_limit.window_start < $4::timestamptz - interval '1 hour'
                             then 1 else rate_limit.count + 1 end,
               window_start = case when rate_limit.window_start < $4::timestamptz - interval '1 hour'
                                   then $4::timestamptz else rate_limit.window_start end
         returning count`,
        [hashId('rl', key, bucket), key, bucket, nowDate.toISOString()],
      );
      return { allowed: r.rows[0].count <= RATE_LIMIT_MAX, count: r.rows[0].count };
    },
  };
}

// ---------------------------------------------------------------------------
// Vercel entrypoint (process edge: clock read + env read allowed here)
// ---------------------------------------------------------------------------

let gazetteerCache = null;

/** Load town slugs from the baked gazetteer (dynamic JSON import = traceable). */
export async function loadGazetteer() {
  if (gazetteerCache) return gazetteerCache;
  // Vercel bundles only api/*.js + traced files: resolve the baked gazetteer
  // module-relative (file: URL in dev/tests) and fall back to cwd (production
  // serverless keeps repo files next to the function). Same pattern as
  // api/weather.js (live-verified 200 in production).
  const u = new URL('../data/towns/us-towns.json', import.meta.url);
  const filePath = u.protocol === 'file:' ? fileURLToPath(u) : resolve(process.cwd(), 'data/towns/us-towns.json');
  let towns;
  try {
    towns = JSON.parse(readFileSync(filePath, 'utf8')).towns;
  } catch (err) {
    throw new Error(`gazetteer load failed (${filePath}): ${err.message}`);
  }
  const set = new Set();
  for (const t of towns) {
    set.add(townId(t.name, t.lat, t.lon));
    set.add(slugify(t.name));
  }
  gazetteerCache = set;
  return set;
}

export default async function handler(req, res) {
  const gazetteer = await loadGazetteer();
  if (!globalThis.__ndsPool) {
    if (!process.env.POSTGRES_URL) return res.status(500).json({ error: 'POSTGRES_URL not set' });
    const { default: pg } = await import('pg');
    globalThis.__ndsPool = new pg.Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  }
  const handle = createHandler({ db: createPgDb(globalThis.__ndsPool), gazetteer, now: () => new Date() });
  return handle(req, res);
}
