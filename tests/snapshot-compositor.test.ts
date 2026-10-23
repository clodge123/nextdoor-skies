// W4-D1 SNAPSHOT-COMPOSITOR unit tests (vitest). Stubbed network + in-memory
// db (wave-1 law: no live services in unit tests). Covers: stitch math,
// variance gate (>=16), session gating, GET round-trip, POST /api/posts
// snapshotId wiring, determinism (R17: identical input -> identical bytes/id).
import { describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  tileGrid,
  worldTile,
  stitchTiles,
  composeSnapshot,
  cropTo16x9,
  varianceOf,
  encodeJpeg,
  parseSnapshotBody,
  OUT_W,
  OUT_H,
  VARIANCE_MIN,
  MAX_ZOOM,
  SNAP_ID_RE,
} from '../api/snapshot.js';
import { createHandler as createPostsHandler } from '../api/posts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GAZ = new Set(['springfield-il-39.78--89.65', 'springfield']);

function session(nickname = 'alice', townSlug = 'springfield-il-39.78--89.65') {
  return JSON.stringify({ nickname, townSlug, townName: 'Springfield' });
}

function makeRes() {
  return {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(b) {
      this.body = b;
      return this;
    },
    json(o) {
      this.headers['content-type'] ??= 'application/json';
      this.body = o;
      return this;
    },
  };
}

/** Stub tile: 512x512 RGBA (ne2sr retina size). `fill` paints a deterministic
 *  pattern; uniform fills model the black/uniform canvas the gate rejects. */
function tile(col, row, z = 6, fill = null) {
  const size = 512;
  const data = new Uint8ClampedArray(size * size * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = 255;
    }
  } else {
    // Map-like: per-tile base color + deterministic checker texture.
    const base = [60 + ((col * 7 + row * 13) % 120), 90 + ((col * 3) % 100), 120 + ((row * 5) % 100)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const k = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? 28 : -28;
        data[i] = Math.min(255, Math.max(0, base[0] + k + (x % 64)));
        data[i + 1] = Math.min(255, Math.max(0, base[1] + k + (y % 64)));
        data[i + 2] = Math.min(255, Math.max(0, base[2] + k));
        data[i + 3] = 255;
      }
    }
  }
  return { z, x: col + 10, y: row + 10, col, row, data, size };
}

/** Grid of 9 tiles; `uniform` fills every pixel the same (variance ~0). */
function gridTiles(uniform = false, fill = [0, 0, 0]) {
  const cells = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) cells.push(tile(col, row, 6, uniform ? fill : null));
  return cells;
}

function harness(fetchTiles) {
  const snapshots = new Map();
  const db = {
    async insertSnapshot(s) {
      snapshots.set(s.id, s);
    },
    async getSnapshot(id) {
      return snapshots.get(id) ?? null;
    },
  };
  const handle = createHandler({ db, gazetteer: GAZ, fetchTiles });
  const call = async (req) => {
    const res = makeRes();
    await handle(req, res);
    return res;
  };
  return { db, snapshots, call };
}

// ---------------------------------------------------------------------------
// Stitch math
// ---------------------------------------------------------------------------

describe('stitch math', () => {
  it('worldTile: known web-mercator values', () => {
    const t = worldTile(0, 0, 1);
    expect(t.x).toBeCloseTo(1, 9);
    expect(t.y).toBeCloseTo(1, 9);
    const t2 = worldTile(-93.3, 37.22, 6);
    expect(t2.x).toBeCloseTo(15.413, 2);
    expect(t2.y).toBeCloseTo(24.862, 2);
  });

  it('tileGrid returns 9 cells centered on the view, contiguous, z=zoom', () => {
    const cells = tileGrid(-93.3, 37.22, 6);
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((c) => c.z))).toEqual(new Set([6]));
    const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
    const ys = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
    expect(xs).toHaveLength(3);
    expect(ys).toHaveLength(3);
    expect(xs[1] - xs[0]).toBe(1);
    expect(ys[1] - ys[0]).toBe(1);
    // center cell sits at col/row 1 (the middle of the 3x3)
    const center = cells.find((c) => c.col === 1 && c.row === 1);
    expect(center).toBeDefined();
  });

  it('tileGrid wraps x at the antimeridian and clamps y at the poles', () => {
    const wrap = tileGrid(179.99, 10, 3);
    expect(wrap.every((c) => c.x >= 0 && c.x < 8)).toBe(true);
    const pole = tileGrid(0, 84, 2);
    expect(pole.every((c) => c.y >= 0 && c.y <= 3)).toBe(true);
  });

  it('stitchTiles places tiles at their grid slots (16px probe)', () => {
    const tiles = [
      { ...tile(0, 0), data: new Uint8ClampedArray(4 * 4 * 4).fill(1), size: 4 },
      { ...tile(1, 0), data: new Uint8ClampedArray(4 * 4 * 4).fill(2), size: 4 },
    ];
    const grid = stitchTiles(tiles);
    expect(grid.length).toBe(12 * 12 * 4);
    expect(grid[0]).toBe(1); // top-left of (0,0) tile
    expect(grid[(0 * 12 + 4) * 4]).toBe(2); // top-left of (1,0) tile
  });

  it('cropTo16x9 produces exactly OUT_W x OUT_H opaque pixels', () => {
    const out = cropTo16x9(stitchTiles(gridTiles()), 3 * 512);
    expect(out.length).toBe(OUT_W * OUT_H * 4);
    expect(out[3]).toBe(255);
    expect(out[out.length - 1]).toBe(255);
  });

  it('encodeJpeg emits real JPEG bytes (FFD8 magic), deterministic', () => {
    const jpeg = encodeJpeg(composeSnapshot(gridTiles()));
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg.length).toBeGreaterThan(1000);
    expect(encodeJpeg(composeSnapshot(gridTiles())).equals(jpeg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Variance gate
// ---------------------------------------------------------------------------

describe('variance gate', () => {
  it('uniform canvas measures ~0; map-like canvas exceeds 16', () => {
    expect(varianceOf(composeSnapshot(gridTiles(true, [0, 0, 0])))).toBeLessThan(1);
    expect(varianceOf(composeSnapshot(gridTiles(true, [128, 128, 128])))).toBeLessThan(1);
    expect(varianceOf(composeSnapshot(gridTiles()))).toBeGreaterThanOrEqual(VARIANCE_MIN);
  });

  it('POST stores a passing snapshot (201) with contract-shaped body', async () => {
    const h = harness(async () => gridTiles());
    const res = await h.call({
      method: 'POST',
      url: '/api/snapshot',
      headers: { 'x-nds-session': session() },
      body: { lat: 37.22, lon: -93.3, zoom: 11 },
    });
    expect(res.statusCode).toBe(201);
    const { id, url, lat, lon, zoom, bytes } = res.body;
    expect(id).toMatch(SNAP_ID_RE);
    expect(url).toBe(`/api/snapshots?path=${id}`);
    expect(lat).toBe(37.22);
    expect(lon).toBe(-93.3);
    expect(zoom).toBe(MAX_ZOOM); // requested 11 clamped to raster ceiling
    expect(bytes).toBeGreaterThan(1000);
    expect(h.snapshots.get(id).jpeg.length).toBe(bytes);
  });

  it('uniform canvas -> ONE refetch, then loud 502 (no fallback, no black image)', async () => {
    const fetchTiles = vi.fn(async () => gridTiles(true, [0, 0, 0]));
    const h = harness(fetchTiles);
    const res = await h.call({
      method: 'POST',
      url: '/api/snapshot',
      headers: { 'x-nds-session': session() },
      body: { lat: 37.22, lon: -93.3, zoom: 6 },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('snapshot failed');
    expect(res.body.detail).toContain('variance gate failed');
    expect(fetchTiles).toHaveBeenCalledTimes(2); // first attempt + one retry
    expect(h.snapshots.size).toBe(0); // nothing stored
  });

  it('transient blank tiles recover on the retry (store on attempt 2)', async () => {
    let calls = 0;
    const h = harness(async () => {
      calls++;
      return calls === 1 ? gridTiles(true, [7, 7, 7]) : gridTiles();
    });
    const res = await h.call({
      method: 'POST',
      url: '/api/snapshot',
      headers: { 'x-nds-session': session() },
      body: { lat: 37.22, lon: -93.3, zoom: 6 },
    });
    expect(res.statusCode).toBe(201);
    expect(calls).toBe(2);
  });

  it('tile fetch failure -> 502 with detail, retried once', async () => {
    const fetchTiles = vi.fn(async () => {
      throw new Error('tile 6/1/1 -> HTTP 500');
    });
    const h = harness(fetchTiles);
    const res = await h.call({
      method: 'POST',
      url: '/api/snapshot',
      headers: { 'x-nds-session': session() },
      body: { lat: 37.22, lon: -93.3, zoom: 6 },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.detail).toContain('tile fetch failed');
    expect(fetchTiles).toHaveBeenCalledTimes(2);
  });

  it('determinism: identical stub tiles -> identical jpeg bytes + id', async () => {
    const h1 = harness(async () => gridTiles());
    const h2 = harness(async () => gridTiles());
    const req = (h) =>
      h.call({
        method: 'POST',
        url: '/api/snapshot',
        headers: { 'x-nds-session': session() },
        body: { lat: 37.22, lon: -93.3, zoom: 6 },
      });
    const r1 = await req(h1);
    const r2 = await req(h2);
    expect(r1.body.id).toBe(r2.body.id);
    expect(h1.snapshots.get(r1.body.id).jpeg.equals(h2.snapshots.get(r2.body.id).jpeg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Session gating + validation
// ---------------------------------------------------------------------------

describe('session gating + validation', () => {
  it('missing session -> 401; malformed -> 401; unknown town -> 401', async () => {
    const h = harness(async () => gridTiles());
    expect((await h.call({ method: 'POST', url: '/api/snapshot', headers: {}, body: { lat: 1, lon: 1, zoom: 5 } })).statusCode).toBe(401);
    expect(
      (await h.call({ method: 'POST', url: '/api/snapshot', headers: { 'x-nds-session': '{' }, body: {} })).statusCode,
    ).toBe(401);
    expect(
      (
        await h.call({
          method: 'POST',
          url: '/api/snapshot',
          headers: { 'x-nds-session': session('bob', 'atlantis') },
          body: { lat: 1, lon: 1, zoom: 5 },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('GET is not method-gated by session (stored JPEGs are public, immutable cache)', async () => {
    const h = harness(async () => gridTiles());
    const post = await h.call({
      method: 'POST',
      url: '/api/snapshot',
      headers: { 'x-nds-session': session() },
      body: { lat: 37.22, lon: -93.3, zoom: 6 },
    });
    const res = await h.call({ method: 'GET', url: `/api/snapshots?path=${post.body.id}`, headers: {} });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.body.length).toBe(post.body.bytes);
  });

  it('GET unknown id -> 404; malformed id -> 400', async () => {
    const h = harness(async () => gridTiles());
    expect((await h.call({ method: 'GET', url: '/api/snapshots?path=snap_zzz', headers: {} })).statusCode).toBe(404);
    expect((await h.call({ method: 'GET', url: '/api/snapshots?path=hack%2F%2Fme', headers: {} })).statusCode).toBe(400);
    expect((await h.call({ method: 'GET', url: '/api/snapshots', headers: {} })).statusCode).toBe(400);
  });

  it('body validation: bad lat/lon/zoom -> 400', () => {
    expect(parseSnapshotBody({}).error).toContain('lat');
    expect(parseSnapshotBody({ lat: 91, lon: 0, zoom: 5 }).error).toContain('lat');
    expect(parseSnapshotBody({ lat: 0, lon: 181, zoom: 5 }).error).toContain('lon');
    expect(parseSnapshotBody({ lat: 0, lon: 0, zoom: 0 }).error).toContain('zoom');
    expect(parseSnapshotBody({ lat: 0, lon: 0, zoom: 13 }).error).toContain('zoom');
    const ok = parseSnapshotBody({ lat: 37.22, lon: -93.3, zoom: 11 });
    expect(ok.zoom).toBe(MAX_ZOOM);
    expect(ok.lat).toBe(37.22);
  });
});

// ---------------------------------------------------------------------------
// POST /api/posts snapshotId wiring
// ---------------------------------------------------------------------------

describe('POST /api/posts snapshotId wiring', () => {
  function postsHarness(snapshots = new Map()) {
    const posts = new Map();
    const db = {
      async insertPost(row) {
        posts.set(row.id, row);
      },
      async getPost(id) {
        return posts.has(id);
      },
      async getSnapshot(id) {
        return snapshots.get(id) ?? null;
      },
      async bumpRate() {
        return { allowed: true, count: 1 };
      },
    };
    const handle = createPostsHandler({ db, gazetteer: GAZ, now: () => new Date('2026-10-22T00:00:00Z') });
    const call = async (req) => {
      const res = makeRes();
      await handle(req, res);
      return res;
    };
    return { db, posts, snapshots, call };
  }

  it('accepts snapshotId + lat/lon/zoom, stores them on the post row', async () => {
    const id = 'snap_test123';
    const h = postsHarness(new Map([[id, { id, jpeg: Buffer.from([1]), lat: 37.22, lon: -93.3, zoom: 6 }]]));
    const res = await h.call({
      method: 'POST',
      url: '/api/posts',
      headers: { 'x-nds-session': session() },
      body: { town: 'springfield-il-39.78--89.65', text: 'look at this', snapshotId: id, lat: 37.22, lon: -93.3, zoom: 6 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.post.snapshotId).toBe(id);
    expect(res.body.post.snapshot).toBe(`/api/snapshots?path=${id}`);
    expect(res.body.post.lat).toBe(37.22);
    expect(res.body.post.lon).toBe(-93.3);
    expect(res.body.post.zoom).toBe(6);
    const row = h.posts.get(res.body.post.id);
    expect(row.snapshotId).toBe(id);
    expect(row.lat).toBe(37.22);
  });

  it('inline burned snapshot + snapshotId: inline JPEG wins the render ref, id stays provenance (W4-D2)', async () => {
    const id = 'snap_burn123';
    const h = postsHarness(new Map([[id, { id, jpeg: Buffer.from([1]), lat: 37.22, lon: -93.3, zoom: 6 }]]));
    const burned = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    const res = await h.call({
      method: 'POST',
      url: '/api/posts',
      headers: { 'x-nds-session': session() },
      body: { town: 'springfield-il-39.78--89.65', text: 'burned strip', snapshotId: id, snapshot: burned, lat: 37.22, lon: -93.3, zoom: 6 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.post.snapshot).toBe(burned); // strip-burned image renders
    expect(res.body.post.snapshotId).toBe(id); // provenance link stays
    const row = h.posts.get(res.body.post.id);
    expect(row.snapshot).toBe(burned);
    expect(row.snapshotId).toBe(id);
  });

  it('unknown snapshotId -> loud 400 (never a silent text-only post)', async () => {
    const h = postsHarness(new Map());;
    const res = await h.call({
      method: 'POST',
      url: '/api/posts',
      headers: { 'x-nds-session': session() },
      body: { town: 'springfield-il-39.78--89.65', text: 'ghost image', snapshotId: 'snap_missing' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('snapshotId');
    expect(h.posts.size).toBe(0);
  });

  it('malformed snapshotId -> 400; plain text post unaffected (snapshot null)', async () => {
    const h = postsHarness();
    const bad = await h.call({
      method: 'POST',
      url: '/api/posts',
      headers: { 'x-nds-session': session() },
      body: { town: 'springfield-il-39.78--89.65', text: 'x', snapshotId: '../../etc/passwd' },
    });
    expect(bad.statusCode).toBe(400);
    const plain = await h.call({
      method: 'POST',
      url: '/api/posts',
      headers: { 'x-nds-session': session() },
      body: { town: 'springfield-il-39.78--89.65', text: 'plain text post' },
    });
    expect(plain.statusCode).toBe(201);
    expect(plain.body.post.snapshot).toBeNull();
    expect(plain.body.post.snapshotId).toBeNull();
  });
});
