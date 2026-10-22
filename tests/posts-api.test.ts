// W4 POSTS-API lane tests (vitest, node env). In-memory stub of the db layer
// (same async interface as createPgDb) — NO Neon in tests (wave-1 law).
import { describe, expect, it } from 'vitest';
import {
  createHandler,
  hotScore,
  parseSession,
  sanitizeNickname,
  snapshotProblem,
  slugify,
  townId,
  hashId,
  FLAG_HIDE_COUNT,
  RATE_LIMIT_MAX,
  SNAPSHOT_MAX_BYTES,
  REACTION_EMOJIS,
} from '../api/posts.js';

// ---------------------------------------------------------------------------
// In-memory db stub — mirrors createPgDb surface (all methods async).
// ---------------------------------------------------------------------------

function makeDb() {
  const posts = new Map();
  const comments = [];
  const reactions = new Map(); // `${postId}|${nickname}` -> emoji
  const flags = new Map(); // `${postId}|${nickname}` -> true
  const rates = new Map(); // key -> { count, windowStartMs }
  const HOUR = 3_600_000;

  return {
    posts,
    async insertPost(row) {
      posts.set(row.id, { ...row });
    },
    async getPost(id) {
      return posts.has(id);
    },
    // W3-D3: full single-post row for GET /api/posts?path=<id> (detail page).
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
      const t = nowDate.getTime();
      let e = rates.get(key);
      if (!e || t - e.windowStartMs > HOUR) {
        e = { count: 0, windowStartMs: t };
      }
      e.count += 1;
      rates.set(key, e);
      return { allowed: e.count <= RATE_LIMIT_MAX, count: e.count };
    },
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const GAZ = new Set(['springfield-il-39.78--89.65', 'springfield', 'portland-or-45.52--122.68']);
const TOWN = 'springfield-il-39.78--89.65';

function session(nickname = 'alice', townSlug = TOWN) {
  return JSON.stringify({ nickname, townSlug, townName: 'Springfield' });
}

function makeRes() {
  return {
    statusCode: 0,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(o) {
      this.body = o;
      return this;
    },
  };
}

function makeReq({ method = 'GET', url, headers = {}, ip = '10.0.0.1', body }) {
  return { method, url, headers, socket: { remoteAddress: ip }, body };
}

function harness(nowIso = '2026-10-21T12:00:00.000Z') {
  const db = makeDb();
  const now = () => new Date(nowIso);
  const handle = createHandler({ db, gazetteer: GAZ, now });
  const call = async (req) => {
    const res = makeRes();
    await handle(req, res);
    return res;
  };
  return { db, handle, call, now };
}

const seedPost = (harness, { id, town = TOWN, text = 'hi', ageMin = 0, author = 'alice' }) =>
  harness.db.posts.set(id, {
    id,
    town,
    author,
    text,
    snapshot: null,
    createdAt: new Date(Date.parse('2026-10-21T12:00:00.000Z') - ageMin * 60_000).toISOString(),
    commentsCount: 0,
    reactionCount: 0,
    flagCount: 0,
    emojis: {},
  });

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe('CRUD', () => {
  it('POST creates a post (201) and GET lists it with contract fields', async () => {
    const h = harness();
    const post = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session() },
        body: { town: TOWN, text: 'storm rolling in from the west' },
      }),
    );
    expect(post.statusCode).toBe(201);
    const p = post.body.post;
    expect(p.id).toMatch(/^p_[0-9a-z]+$/);
    expect(p.author).toBe('alice');
    expect(p.town).toBe(TOWN);
    expect(p.text).toBe('storm rolling in from the west');
    expect(p.snapshot).toBeNull();
    expect(p.createdAt).toBe('2026-10-21T12:00:00.000Z');
    expect(p.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); // ISO-8601
    expect(p.reactions).toEqual({ '👍': 0, '❤️': 0, '😂': 0 });
    expect(p.myReaction).toBeNull();
    expect(p.commentsCount).toBe(0);
    expect(typeof p.hot).toBe('boolean');

    const list = await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=new` }));
    expect(list.statusCode).toBe(200);
    expect(list.body.posts).toHaveLength(1);
    expect(list.body.posts[0].id).toBe(p.id);
  });

  it('GET requires the town param and validates sort', async () => {
    const h = harness();
    expect((await h.call(makeReq({ url: '/api/posts' }))).statusCode).toBe(400);
    expect((await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=top` }))).statusCode).toBe(400);
  });

  it('POST rejects unknown town slug and empty text', async () => {
    const h = harness();
    const bad = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session('alice', 'atlantis-1.5-1.5') },
        body: { town: 'atlantis-1.5-1.5', text: 'hello' },
      }),
    );
    expect(bad.statusCode).toBe(401); // session townSlug must exist in gazetteer
    const noTown = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session() },
        body: { town: 'nowhere-9.9-9.9', text: 'hi' },
      }),
    );
    expect(noTown.statusCode).toBe(400);
    const empty = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session() },
        body: { town: TOWN, text: '   ' },
      }),
    );
    expect(empty.statusCode).toBe(400);
  });

  it('comments: POST then GET round-trips (one level only)', async () => {
    const h = harness();
    seedPost(h, { id: 'p_x' });
    const c = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts/p_x/comments',
        headers: { 'x-nds-session': session('bob') },
        body: { text: 'confirmed, heavy rain' },
      }),
    );
    expect(c.statusCode).toBe(201);
    expect(c.body).toMatchObject({ author: 'bob', text: 'confirmed, heavy rain', postId: 'p_x' });
    expect(c.body.createdAt).toBe('2026-10-21T12:00:00.000Z');

    const list = await h.call(makeReq({ url: '/api/posts/p_x/comments' }));
    expect(list.statusCode).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toEqual({
      id: c.body.id,
      author: 'bob',
      text: 'confirmed, heavy rain',
      createdAt: '2026-10-21T12:00:00.000Z',
    });
  });

  it('one level: commenting on a comment id 404s (no nested threads)', async () => {
    const h = harness();
    seedPost(h, { id: 'p_x' });
    const c = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts/p_x/comments',
        headers: { 'x-nds-session': session('bob') },
        body: { text: 'top level' },
      }),
    );
    const nested = await h.call(
      makeReq({
        method: 'POST',
        url: `/api/posts/${c.body.id}/comments`,
        headers: { 'x-nds-session': session('eve') },
        body: { text: 'reply to reply' },
      }),
    );
    expect(nested.statusCode).toBe(404);
  });

  it('404 for unknown post, 401 for missing session on writes', async () => {
    const h = harness();
    expect((await h.call(makeReq({ url: '/api/posts/nope/comments' }))).statusCode).toBe(404);
    expect(
      (
        await h.call(makeReq({ method: 'POST', url: '/api/posts/p_x/comments', body: { text: 'hi' } }))
      ).statusCode,
    ).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// W3-D3 single-post route — GET /api/posts?path=<id> (the /p/<id> detail page)
// ---------------------------------------------------------------------------

describe('single post by id (W3-D3 detail route)', () => {
  it('GET ?path=<id> returns the contract-shaped post with reaction counts', async () => {
    const h = harness();
    seedPost(h, { id: 'p_detail', text: 'storm cell' });
    await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts/p_detail/reactions',
        headers: { 'x-nds-session': session('bob') },
        body: { emoji: '👍' },
      }),
    );
    const res = await h.call(makeReq({ url: '/api/posts?path=p_detail' }));
    expect(res.statusCode).toBe(200);
    expect(res.body.post.id).toBe('p_detail');
    expect(res.body.post.author).toBe('alice');
    expect(res.body.post.text).toBe('storm cell');
    expect(res.body.post.snapshot).toBeNull();
    expect(res.body.post.reactions['👍']).toBe(1);
    expect(res.body.post.commentsCount).toBe(0);
    expect(res.body.post.myReaction).toBeNull();
  });

  it('GET ?path=<id> with a session echoes myReaction', async () => {
    const h = harness();
    seedPost(h, { id: 'p_mine' });
    await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts/p_mine/reactions',
        headers: { 'x-nds-session': session('alice') },
        body: { emoji: '❤️' },
      }),
    );
    const res = await h.call(
      makeReq({ url: '/api/posts?path=p_mine', headers: { 'x-nds-session': session('alice') } }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.post.myReaction).toBe('❤️');
  });

  it('unknown id -> 404 (honest deep-link law); flagged-out post reads as gone', async () => {
    const h = harness();
    expect((await h.call(makeReq({ url: '/api/posts?path=nope' }))).statusCode).toBe(404);
    seedPost(h, { id: 'p_flagged' });
    for (const who of ['aa', 'bb', 'cc']) {
      await h.call(
        makeReq({
          method: 'POST',
          url: '/api/posts/p_flagged/flag',
          headers: { 'x-nds-session': session(who) },
          body: {},
        }),
      );
    }
    const res = await h.call(makeReq({ url: '/api/posts?path=p_flagged' }));
    expect(res.statusCode).toBe(404);
  });

  it('non-GET on the bare-id route stays 404 (no write surface invented)', async () => {
    const h = harness();
    seedPost(h, { id: 'p_ro' });
    const res = await h.call(
      makeReq({ method: 'POST', url: '/api/posts?path=p_ro', body: { text: 'nope' } }),
    );
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Hot ranking math
// ---------------------------------------------------------------------------

describe('hot ranking', () => {
  it('score = replies*2 + reactions*1 + recency decay', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const s = hotScore({
      commentsCount: 2,
      reactionsTotal: 1,
      createdAt: '2026-10-21T12:00:00.000Z',
      now,
    });
    expect(s).toBeCloseTo(2 * 2 + 1 + 1, 10); // brand-new decay term = 1
    const aged = hotScore({ commentsCount: 0, reactionsTotal: 0, createdAt: '2026-10-21T00:00:00.000Z', now });
    expect(aged).toBeCloseTo(Math.exp(-12 / 12), 10); // 12h old -> e^-1
  });

  it('sort=hot pins hot posts first, then newest', async () => {
    const h = harness();
    seedPost(h, { id: 'p_old_hot', text: 'old hot', ageMin: 600 }); // 10h, 2 replies -> hot
    seedPost(h, { id: 'p_new_plain', text: 'new plain', ageMin: 0 }); // fresh, 0 replies -> not hot
    seedPost(h, { id: 'p_mid_hot', text: 'mid hot', ageMin: 60 }); // 1h, 2 replies -> hotter
    // 2 comments each on the hot ones
    h.db.insertComment({ id: 'c1', postId: 'p_old_hot', author: 'b', text: 'x', createdAt: '2026-10-21T02:00:00.000Z' });
    h.db.insertComment({ id: 'c2', postId: 'p_old_hot', author: 'c', text: 'y', createdAt: '2026-10-21T02:00:01.000Z' });
    h.db.insertComment({ id: 'c3', postId: 'p_mid_hot', author: 'b', text: 'x', createdAt: '2026-10-21T11:00:00.000Z' });
    h.db.insertComment({ id: 'c4', postId: 'p_mid_hot', author: 'c', text: 'y', createdAt: '2026-10-21T11:00:01.000Z' });

    const hot = await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=hot` }));
    const ids = hot.body.posts.map((p) => p.id);
    expect(ids).toEqual(['p_mid_hot', 'p_old_hot', 'p_new_plain']);
    expect(hot.body.posts.map((p) => p.hot)).toEqual([true, true, false]);

    const newest = await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=new` }));
    expect(newest.body.posts.map((p) => p.id)).toEqual(['p_new_plain', 'p_mid_hot', 'p_old_hot']);
  });
});

// ---------------------------------------------------------------------------
// Reactions (toggle)
// ---------------------------------------------------------------------------

describe('reactions', () => {
  it('toggle: same emoji twice removes; swap replaces; one per nickname per post', async () => {
    const h = harness();
    seedPost(h, { id: 'p_x' });
    const url = '/api/posts/p_x/reactions';
    const hdr = { 'x-nds-session': session('alice') };

    let r = await h.call(makeReq({ method: 'POST', url, headers: hdr, body: { emoji: '👍' } }));
    expect(r.statusCode).toBe(200);
    expect(r.body.myReaction).toBe('👍');

    r = await h.call(makeReq({ method: 'POST', url, headers: hdr, body: { emoji: '👍' } }));
    expect(r.body.myReaction).toBeNull(); // toggled off

    await h.call(makeReq({ method: 'POST', url, headers: hdr, body: { emoji: '👍' } }));
    r = await h.call(makeReq({ method: 'POST', url, headers: hdr, body: { emoji: '❤️' } }));
    expect(r.body.myReaction).toBe('❤️'); // replaced
    expect(await h.db.getReaction('p_x', 'alice')).toBe('❤️'); // still ONE row

    const list = await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=new` }));
    expect(list.body.posts[0].reactions['❤️']).toBe(1);
    expect(list.body.posts[0].myReaction).toBeNull(); // anonymous view
  });

  it('rejects unknown emoji and missing session', async () => {
    const h = harness();
    seedPost(h, { id: 'p_x' });
    const bad = await h.call(
      makeReq({ method: 'POST', url: '/api/posts/p_x/reactions', headers: { 'x-nds-session': session() }, body: { emoji: '🤮' } }),
    );
    expect(bad.statusCode).toBe(400);
    const anon = await h.call(makeReq({ method: 'POST', url: '/api/posts/p_x/reactions', body: { emoji: '👍' } }));
    expect(anon.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Flags -> hidden from feeds
// ---------------------------------------------------------------------------

describe('flags', () => {
  it('post hidden from feeds after 3 distinct flags; duplicates do not count', async () => {
    const h = harness();
    seedPost(h, { id: 'p_x' });
    const flag = (nick) =>
      h.call(makeReq({ method: 'POST', url: '/api/posts/p_x/flag', headers: { 'x-nds-session': session(nick) } }));

    expect((await flag('u1')).body.flags).toBe(1);
    expect((await flag('u1')).body.flags).toBe(1); // same nickname = duplicate
    expect((await flag('u2')).body.flags).toBe(2);
    let feed = await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=new` }));
    expect(feed.body.posts.map((p) => p.id)).toContain('p_x');

    expect((await flag('u3')).body.flags).toBe(3);
    feed = await h.call(makeReq({ url: `/api/posts?town=${TOWN}&sort=new` }));
    expect(feed.body.posts).toHaveLength(0); // hidden after FLAG_HIDE_COUNT = 3
    expect(FLAG_HIDE_COUNT).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Rate limit (per-IP 5/hour)
// ---------------------------------------------------------------------------

describe('rate limit', () => {
  const post = (h, ip) =>
    h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session('alice') },
        ip,
        body: { town: TOWN, text: `msg ${h.db.posts.size}` },
      }),
    );

  it('allows 5 posts/hour per IP, blocks the 6th with 429', async () => {
    const h = harness();
    for (let i = 1; i <= RATE_LIMIT_MAX; i++) expect((await post(h, '9.9.9.9')).statusCode).toBe(201);
    const sixth = await post(h, '9.9.9.9');
    expect(sixth.statusCode).toBe(429);
    expect(sixth.body.error).toMatch(/rate limited/);
  });

  it('per-IP isolation and hourly window reset', async () => {
    const h = harness();
    for (let i = 1; i <= RATE_LIMIT_MAX; i++) await post(h, '9.9.9.9');
    expect((await post(h, '8.8.8.8')).statusCode).toBe(201); // other IP unaffected

    const h2 = harness();
    for (let i = 1; i <= RATE_LIMIT_MAX; i++) await post(h2, '9.9.9.9');
    expect((await post(h2, '9.9.9.9')).statusCode).toBe(429);
    // advance the injected clock 1h1m -> window resets
    h2.handle = createHandler({
      db: h2.db,
      gazetteer: GAZ,
      now: () => new Date(Date.parse('2026-10-21T12:00:00.000Z') + 3_600_000 + 60_000),
    });
    const res = makeRes();
    await h2.handle(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session('alice') },
        ip: '9.9.9.9',
        body: { town: TOWN, text: 'next hour' },
      }),
      res,
    );
    expect(res.statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

describe('session validation', () => {
  it('401 without x-nds-session header', async () => {
    const h = harness();
    const r = await h.call(
      makeReq({ method: 'POST', url: '/api/posts', body: { town: TOWN, text: 'anon' } }),
    );
    expect(r.statusCode).toBe(401);
  });

  it('401 on malformed / bad-nickname / unknown-town sessions', async () => {
    const h = harness();
    const hdr = (v) => ({ 'x-nds-session': v });
    expect(
      (await h.call(makeReq({ method: 'POST', url: '/api/posts', headers: hdr('{not json'), body: {} }))).statusCode,
    ).toBe(401);
    expect(
      (
        await h.call(
          makeReq({ method: 'POST', url: '/api/posts', headers: hdr(session('a')), body: { town: TOWN, text: 'x' } }),
        )
      ).statusCode,
    ).toBe(401); // 1 char < 2
    expect(
      (
        await h.call(
          makeReq({
            method: 'POST',
            url: '/api/posts',
            headers: hdr(session('a'.repeat(25))),
            body: { town: TOWN, text: 'x' },
          }),
        )
      ).statusCode,
    ).toBe(401); // > 24
    expect(
      (
        await h.call(
          makeReq({
            method: 'POST',
            url: '/api/posts',
            headers: hdr(session('<script>alert(1)</script>')),
            body: { town: TOWN, text: 'x' },
          }),
        )
      ).statusCode,
    ).toBe(401); // HTML in nickname
    expect(
      (
        await h.call(
          makeReq({ method: 'POST', url: '/api/posts', headers: hdr(session('alice', 'atlantis-9.9-9.9')), body: { town: TOWN, text: 'x' } }),
        )
      ).statusCode,
    ).toBe(401); // town not in gazetteer
  });

  it('sanitizeNickname bounds + gazetteer helpers', () => {
    expect(sanitizeNickname('  bob  ')).toBe('bob');
    expect(sanitizeNickname('a')).toBeNull();
    expect(sanitizeNickname('x'.repeat(25))).toBeNull();
    expect(sanitizeNickname('bo&b')).toBeNull();
    expect(slugify('Springfield!')).toBe('springfield');
    expect(townId('Springfield', 39.78123, -89.65012)).toBe('springfield-39.78--89.65');
    expect(parseSession({ headers: { 'x-nds-session': session() } }, GAZ).session.nickname).toBe('alice');
  });
});

// ---------------------------------------------------------------------------
// Snapshot size cap (S7)
// ---------------------------------------------------------------------------

describe('snapshot cap', () => {
  const jpeg = (kb) => `data:image/jpeg;base64,${Buffer.alloc(kb * 1024, 1).toString('base64')}`;

  it('accepts <=120KB jpeg data URL, rejects oversized (413) and non-jpeg (415)', async () => {
    const h = harness();
    const ok = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session() },
        body: { town: TOWN, text: 'look', snapshot: jpeg(120) },
      }),
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.body.post.snapshot).toBe(jpeg(120));

    const big = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session() },
        body: { town: TOWN, text: 'look', snapshot: jpeg(121) },
      }),
    );
    expect(big.statusCode).toBe(413);

    const png = await h.call(
      makeReq({
        method: 'POST',
        url: '/api/posts',
        headers: { 'x-nds-session': session() },
        body: { town: TOWN, text: 'look', snapshot: 'data:image/png;base64,AAAA' },
      }),
    );
    expect(png.statusCode).toBe(415);

    expect(SNAPSHOT_MAX_BYTES).toBe(120 * 1024);
    expect(snapshotProblem(jpeg(120))).toBeNull();
    expect(snapshotProblem(jpeg(121))).toBe('size');
    expect(snapshotProblem(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Determinism (R17) — api/posts.js keeps clock/RNG reads at the edge only
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('api/posts.js has no Math.random / Date.now outside documented edge', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve('api/posts.js'), 'utf8');
    const lines = src.split('\n');
    const code = lines.filter((l) => !/^\s*(\/\/|\*)/.test(l)); // strip comments
    const hits = [];
    code.forEach((line, i) => {
      if (/\bMath\.random\b/.test(line)) hits.push(`Math.random @${i + 1}`);
      if (/\bDate\.now\b/.test(line)) hits.push(`Date.now @${i + 1}`);
    });
    expect(hits).toEqual([]);
    // new Date appears only in edge conversions (isoOf) + default-export edge
    const newDateLines = code.filter((l) => /\bnew Date\b/.test(l));
    expect(newDateLines.length).toBeGreaterThan(0);
    expect(newDateLines.every((l) => l.includes('new Date(v)') || l.includes('() => new Date()'))).toBe(true);
  });

  it('ids are deterministic content hashes (no RNG)', () => {
    expect(hashId('p', 'a', 'b', 'c')).toBe(hashId('p', 'a', 'b', 'c'));
    expect(hashId('p', 'a', 'b', 'c')).not.toBe(hashId('p', 'a', 'b', 'd'));
  });
});
