// W4-D1 SNAPSHOT GATE (wave 4, lane D1) — REAL_API=1 gated Playwright spec.
// Exercises the ACTUAL api/snapshot.js handler through scripts/api-serve.mjs
// (zero mocked routes — C6 law), including REAL tile fetches from
// tiles.openfreemap.org. Proves: POST -> real JPEG bytes (variance >= 16,
// content-type image/jpeg), GET round-trip (immutable cache), session
// gating 401, and POST /api/posts snapshotId wiring.
//
// Run:  REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/snapshot.spec.ts
import { expect, test } from '@playwright/test';
import { decode } from 'jpeg-js';

const API_PORT = Number(process.env.E2E_API_PORT ?? 43118);
const API = `http://127.0.0.1:${API_PORT}`;
const TOWN_SLUG = 'springfield-37.22--93.3';
const SESSION = JSON.stringify({ nickname: 'jordan', townSlug: TOWN_SLUG, townName: 'Springfield' });
const HEADERS = { 'content-type': 'application/json', 'x-nds-session': SESSION };

/** Luminance variance (C7 metric, seed-wave2.mjs formula) of decoded JPEG. */
function jpegVariance(buf) {
  const { data } = decode(buf, { useTArray: true });
  let sum = 0, sum2 = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += lum;
    sum2 += lum * lum;
    n++;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

test.describe('snapshot compositor (real api, real tiles)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run');

  test('POST /api/snapshot -> stored JPEG (variance >= 16), GET round-trip, 401 gating', async ({ request }) => {
    // 1. POST — session-gated, real Springfield view.
    const post = await request.post(`${API}/api/snapshot`, {
      headers: HEADERS,
      data: { lat: 37.22, lon: -93.3, zoom: 11 },
    });
    expect(post.status()).toBe(201);
    const snap = await post.json();
    expect(snap.id).toMatch(/^snap_[0-9a-z]+$/);
    expect(snap.url).toContain(snap.id);
    expect(snap.bytes).toBeGreaterThan(1000);
    expect(snap.zoom).toBeLessThanOrEqual(6); // raster ceiling clamp (documented)

    // 2. GET round-trip — byte-identical JPEG, immutable cache, image/jpeg.
    const get = await request.get(`${API}/api/snapshots`, { params: { path: snap.id } });
    expect(get.status()).toBe(200);
    expect(get.headers()['content-type']).toBe('image/jpeg');
    expect(get.headers()['cache-control']).toContain('immutable');
    const bytes = await get.body();
    expect(bytes.length).toBe(snap.bytes);
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG SOI

    // 3. VARIANCE GATE PROOF — decoded pixels are NOT uniform (black = 0).
    const variance = jpegVariance(bytes);
    console.log(`[snapshot] ${snap.id} variance=${variance.toFixed(1)} bytes=${bytes.length}`);
    expect(variance).toBeGreaterThanOrEqual(16);

    // 4. Session gating — no session -> 401, loud.
    const anon = await request.post(`${API}/api/snapshot`, {
      data: { lat: 37.22, lon: -93.3, zoom: 6 },
    });
    expect(anon.status()).toBe(401);

    // 5. POST /api/posts wires snapshotId onto the post row.
    const feed = await request.post(`${API}/api/posts`, {
      headers: HEADERS,
      data: { town: TOWN_SLUG, text: 'look at this sky (w4-d1 gate)', snapshotId: snap.id, lat: 37.22, lon: -93.3, zoom: snap.zoom },
    });
    expect(feed.status()).toBe(201);
    const row = (await feed.json()).post;
    expect(row.snapshotId).toBe(snap.id);
    expect(row.snapshot).toContain(snap.id);
    expect(row.lat).toBe(37.22);

    // 6. Unknown snapshotId -> loud 400 (no silent text-only post).
    const ghost = await request.post(`${API}/api/posts`, {
      headers: HEADERS,
      data: { town: TOWN_SLUG, text: 'ghost', snapshotId: 'snap_nonexistent' },
    });
    expect(ghost.status()).toBe(400);
  });
});
