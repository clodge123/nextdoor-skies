import { expect, test, type Route } from '@playwright/test';
import { buildSeedData } from '../server/lib/seed.js';
import { FEED_HTML } from './fixtures/feed-page.js';
import { markTourSeen } from './tour-seed';

/**
 * W3-D2 CAPTURE-FRESHNESS GATE (C7): the exact capture sequence the seeder
 * runs (style load -> jumpTo -> tiles-loaded/idle -> two rAF paint frames ->
 * canvas encode -> decoded-pixel variance) must produce a NON-UNIFORM frame.
 * Wave 2 shipped byte-identical black JPEGs because capture ran before
 * maplibre painted tiles; this spec fails if the canvas is ever uniform.
 * Tiles are relayed node-side (host proxy strips CORS — map.spec.ts law).
 */
test('map snapshot capture is fresh (non-black canvas, C7)', async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  // Keep the app console-clean: stub the weather proxy + alerts poll, relay
  // basemap tiles node-side (identical relay to tests/map.spec.ts).
  await page.route(/\/api\/weather\?.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps: {}, stale: false }) }),
  );
  await page.route(/\/api\/alerts\?.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [], stale: false }) }),
  );
  async function relayOfm(route: Route) {
    const url = route.request().url();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await route.fulfill({
          status: 200,
          body: buf,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
          },
        });
        return;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    await route.fulfill({ status: 502, body: String(lastErr) });
  }
  await page.route('**tiles.openfreemap.org/**', relayOfm);

  // Chicago-class landing: center on a real town at zoom 10 (seeder shape).
  await markTourSeen(page);
  await page.goto('/?ndsCenter=-87.65,41.85', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() => (window as { ndsMap: { jumpTo: (o: object) => void } }).ndsMap.jumpTo({ center: [-87.65, 41.85], zoom: 10 }));
  await page.waitForFunction(
    () => {
      const m = (window as { ndsMap: { isStyleLoaded: () => boolean; areTilesLoaded: () => boolean; isMoving: () => boolean } }).ndsMap;
      return m.isStyleLoaded() && m.areTilesLoaded() && !m.isMoving();
    },
    null,
    { timeout: 60_000 },
  );
  // Two rAF ticks = guaranteed presented paint frame (the C7 fix).
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));

  const snap = await page.evaluate(async () => {
    const nds = (window as { ndsMap?: { getCanvas?: () => HTMLCanvasElement } }).ndsMap;
    const canvas = nds?.getCanvas?.();
    if (!canvas || !canvas.width) return { ok: false, error: 'no canvas' };
    const out = document.createElement('canvas');
    const scale = Math.min(1, 600 / Math.max(canvas.width, canvas.height));
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = out.getContext('2d');
    if (!ctx) return { ok: false, error: 'no ctx' };
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/jpeg', 0.6);
    // Decode a 32x32 sample: variance + channel spread (uniform canvas = 0).
    const img = new Image();
    img.src = dataUrl;
    await img.decode(); // drawImage on an undecoded image is a NO-OP (variance 0)
    const S = 32;
    const s = document.createElement('canvas');
    s.width = S; s.height = S;
    const sc = s.getContext('2d');
    sc.drawImage(img, 0, 0, S, S);
    const px = sc.getImageData(0, 0, S, S).data;
    let sum = 0, sum2 = 0, mn = 255, mx = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      sum += lum; sum2 += lum * lum;
      if (px[i] < mn) mn = px[i];
      if (px[i] > mx) mx = px[i];
    }
    const n = px.length / 4;
    const mean = sum / n;
    return { ok: true, bytes: Math.floor((dataUrl.length - 23) * 0.75), variance: sum2 / n - mean * mean, delta: mx - mn };
  });

  expect(snap.ok, `capture failed: ${(snap as { error?: string }).error}`).toBe(true);
  expect(snap.variance, 'canvas variance ~0 = captured before tiles painted (the C7 black-image bug class)').toBeGreaterThanOrEqual(16);
  expect(snap.delta).toBeGreaterThanOrEqual(16);
  expect(snap.bytes).toBeGreaterThan(1024); // a real JPEG, not an empty canvas
  void testInfo;
});

/**
 * Gate 1 (L7): the feed page shows seeded demo posts carrying an honest
 * "Demo data" label. API is mocked with the real seed output — no prod Neon.
 */
test('feed page renders seeded posts with Demo data labels', async ({ page }) => {
  const seed = buildSeedData(new Date('2026-10-20T18:00:00.000Z'));

  await page.route('http://seed.local/api/reports', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reports: seed.reports, comments: seed.comments }),
    }),
  );
  await page.route('http://seed.local/', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FEED_HTML }),
  );

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('http://seed.local/');

  const posts = page.locator('.post');
  await expect(posts).toHaveCount(30);

  const labels = page.locator('.demo-label');
  await expect(labels).toHaveCount(30);
  await expect(labels.first()).toHaveText('Demo data');

  // every rendered post is marked seeded
  await expect(page.locator('.post[data-seeded="true"]')).toHaveCount(30);

  // one-level comments render under posts
  await expect(page.locator('.comment').first()).toBeVisible();

  // a real town label + a valid weather type are visible
  await expect(page.locator('.post .meta', { hasText: 'Marfa, TX' }).first()).toBeVisible();
  await expect(page.locator('.type', { hasText: /rain|storm|snow|clear|heat/i }).first()).toBeVisible();

  expect(consoleErrors).toEqual([]);

  await page.screenshot({ path: 'docs/screenshots/L7/feed-seeded-desktop.png', fullPage: false });
});

// ---------------------------------------------------------------------------
// W3-E1 POLISH SEEDS GATE (gated: REAL_API=1). The local real-API harness,
// seeded via scripts/polish-seeds.mjs's deterministic plan, must show the
// polished demo towns ALIVE in the Hot view: ≥1 non-black map snapshot per
// demo town + visible engagement (reactions + replies) pinned hot. Zero
// mocked routes — every write travels the production-shaped ?path= form.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const API_PORT = Number(process.env.E2E_API_PORT ?? 43118);
const API = `http://127.0.0.1:${API_PORT}`;

/** The 5 demo towns (canonical slugify(name)-<lat2dp>-<lon2dp>). */
const DEMO_TOWNS = [
  { slug: 'springfield-37.22--93.3', name: 'Springfield' },
  { slug: 'salina-38.84--97.61', name: 'Salina' },
  { slug: 'amarillo-35.22--101.83', name: 'Amarillo' },
  { slug: 'flagstaff-35.2--111.65', name: 'Flagstaff' },
  { slug: 'santa-fe-35.69--105.94', name: 'Santa Fe' },
];

/** Committed deterministic basemap frame (map-like JPEG, variance ≫ 16). */
const SNAPSHOT = 'data:image/jpeg;base64,'
  + readFileSync(resolve(HERE, 'fixtures', 'polish-map.jpg')).toString('base64');

/** Authored polish texts per demo town (index 0 = snapshot post). Must stay
 *  text-identical to scripts/seed-wave2.mjs POLISH (the CI source of truth). */
const POLISH_TEXTS: Record<string, string[]> = {
  'springfield-37.22--93.3': [
    'Storm chase report from the county line: the supercell east of town spun up a funnel over the farmland, radar painted red for two hours, everyone back safe by supper.',
    'Fog in the Ozark hollows at dawn, the river bottoms disappeared and the bluffs floated above the white.',
    'Heat wave third day running, the creek behind the park is down to a whisper, sprinkles on at dusk.',
    'First ice storm of the season glazed the ridge roads, school closed, the oaks creaked all night.',
  ],
  'salina-38.84--97.61': [
    'Chasers parked the ridge road west of town at noon and watched a tornadic wedge parade across the wheat for forty minutes, nothing on the ground, pictures for days.',
    'Prairie fog rolled off the smoky hills this morning, the interstate disappeared between Salina and Abilene.',
    'Heat wave baked the wheat early, the combines are running after dark to beat the humidity.',
    'First lake-effect band of the winter slid over the valley, two inches on the orchards, gone by lunch.',
  ],
  'amarillo-35.22--101.83': [
    'Hail core crossed the panhandle at rush hour, quarters in the parking lot, the sky went green and the sirens did their thing.',
    'Haboob swallowed the horizon at dusk, a wall of dust ate the highway and the air smelled like iron.',
    'Heat dome parked over the flatlands, triple digits five days straight, the only honest forecast is the AC unit.',
    'Cold front dropped twenty degrees overnight, first frost on the mesquite, everyone remembered their coats.',
  ],
  'flagstaff-35.2--111.65': [
    'First snow of the season blanketed the ponderosas overnight, the Aspen Highlands road is chains-only by morning.',
    'Monsoon cell broke over the valley, lightning on the ridge all evening and the washes running brown.',
    'Dry cold under a blue you cannot get anywhere near sea level, the sun warm, the shade a freezer.',
    'Fog bank sat on the pines all afternoon, the town lights glowing through it like lanterns.',
  ],
  'santa-fe-35.69--105.94': [
    'Snow dusted the plaza at dawn, adobes wearing white, the high desert went quiet and silver by midmorning.',
    'Aspen gold on the canyon roads, morning fog filling the arroyos, the light turning everything to honey.',
    'High desert wind kicked up out of the west, cottonwood flurries in the plaza, the fire risk climbing.',
    'Heat wave broke with a monsoon thunderhead, rain drumming on the flat roofs, the arroyos singing again.',
  ],
};

const NICKS = [
  'maple', 'junebug', 'prairie', 'sunny', 'river', 'dusty', 'willow', 'pepper',
  'cloudbase', 'fern', 'biscuit', 'pumpkin', 'hazel', 'wren', 'meadowlark',
  'coyote', 'cricket', 'juniper', 'poppy', 'otter', 'sandpiper', 'thistle',
];

/** Seed one demo town idempotently (text-match skip) + deterministic
 *  engagement: reactions 3+i%6 (unique rotating nicknames — reactions key on
 *  (post,nickname)), comments 1+i%3 (polish floor: every post commented). */
async function seedDemoTown(request: import('@playwright/test').APIRequestContext, town: { slug: string; name: string }, baseIndex: number) {
  const texts = POLISH_TEXTS[town.slug];
  const session = (nickname: string) => JSON.stringify({ nickname, townSlug: town.slug, townName: town.name });
  for (let i = 0; i < texts.length; i++) {
    const idx = baseIndex + i;
    const list = await request.get(`${API}/api/posts`, { params: { town: town.slug, sort: 'new' } });
    const rows = (await list.json()).posts.filter((p: { text: string }) => p.text === texts[i]);
    let postId: string | null = rows.length ? rows[0].id : null;
    if (!postId) {
      const payload: Record<string, unknown> = { town: town.slug, text: texts[i] };
      if (i === 0) payload.snapshot = SNAPSHOT;
      const created = await request.post(`${API}/api/posts`, {
        headers: { 'content-type': 'application/json', 'x-nds-session': session(NICKS[(idx + i) % NICKS.length]) },
        data: payload,
      });
      if (!created.ok()) throw new Error(`seed ${town.slug}[${i}] -> ${created.status()}`);
      postId = (await created.json()).post.id;
    }
    const wantR = 3 + (idx % 6);
    const wantC = 1 + (idx % 3);
    const cur = await request.get(`${API}/api/posts`, { params: { path: postId } });
    const row = (await cur.json()).post ?? (await cur.json());
    const currentR = Object.values(row.reactions ?? {}).reduce((a: number, b: number) => a + b, 0);
    const currentC = row.commentsCount ?? 0;
    for (let j = currentR; j < wantR; j++) {
      await request.post(`${API}/api/posts`, {
        params: { path: `${postId}/reactions` },
        headers: { 'content-type': 'application/json', 'x-nds-session': session(NICKS[(idx * 7 + j * 5) % NICKS.length]) },
        data: { emoji: ['👍', '❤️', '😂'][(idx + j) % 3] },
      });
    }
    for (let j = currentC; j < wantC; j++) {
      await request.post(`${API}/api/posts`, {
        params: { path: `${postId}/comments` },
        headers: { 'content-type': 'application/json', 'x-nds-session': session('meadowlark') },
        data: { text: 'Watching the radar loop right now, it looks intense.' },
      });
    }
  }
}

test.describe('polished seeds on the real-API harness (W3-E1)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run');

  test('demo towns show polished posts: non-black snapshots + engagement, hot view alive', async ({ page }) => {
    test.setTimeout(120_000);

    // Seed all 5 demo towns (idempotent across viewport projects).
    let idx = 177;
    for (const town of DEMO_TOWNS) {
      await seedDemoTown(page.request, town, idx);
      idx += 4;
    }

    // API-level: every demo town has >=1 snapshot post, >=1 commented post,
    // and hot-sorted output pins engagement-bearing posts first.
    for (const town of DEMO_TOWNS) {
      const res = await page.request.get(`${API}/api/posts`, {
        params: { town: town.slug, sort: 'hot' },
        headers: { 'x-nds-session': JSON.stringify({ nickname: 'maple', townSlug: town.slug, townName: town.name }) },
      });
      expect(res.ok(), town.slug).toBe(true);
      const posts = (await res.json()).posts;
      expect(posts.length, town.slug).toBeGreaterThanOrEqual(4);
      expect(posts.filter((p: { snapshot: string | null }) => p.snapshot).length, `${town.slug} snapshots`).toBeGreaterThanOrEqual(1);
      expect(posts.filter((p: { commentsCount: number }) => p.commentsCount > 0).length, `${town.slug} commented`).toBeGreaterThanOrEqual(1);
      const hotPosts = posts.filter((p: { hot: boolean }) => p.hot);
      expect(hotPosts.length, `${town.slug} hot-pinned`).toBeGreaterThanOrEqual(1);
    }

    // UI-level (Springfield): hot view pins cards with VISIBLE engagement
    // counts, and the snapshot <img> decodes NON-BLACK (canvas variance gate).
    const spring = DEMO_TOWNS[0];
    await page.addInitScript(
      ([key, value]: string[]) => localStorage.setItem(key, value),
      ['nds-session', JSON.stringify({ nickname: 'maple', townSlug: spring.slug, townName: spring.name })],
    );
    await page.goto(`${API}/feed`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('feed-page')).toBeVisible({ timeout: 15_000 });
    const pinned = page.getByTestId('hot-pinned');
    await expect(pinned).toBeVisible({ timeout: 10_000 });

    // Engagement visible: reaction counts render (>=1 total on pinned cards).
    const counts = pinned.locator('.feed-reaction-count');
    await expect(counts.first()).toBeVisible({ timeout: 10_000 });
    const total = await pinned.locator('.feed-card').first().locator('.feed-reaction-count')
      .evaluateAll((els) => els.reduce((a, el) => a + Number(el.textContent || 0), 0));
    expect(total).toBeGreaterThanOrEqual(3);

    // Replies visible on a pinned card.
    const replies = pinned.locator('.feed-reply-toggle');
    await expect(replies.filter({ hasText: /Replies \(\d+\)/ }).first()).toBeVisible({ timeout: 10_000 });

    // Snapshot non-black: decode the hot-pinned snapshot in-page and measure
    // pixel variance (same C7 bar: >=16 luminance variance).
    const snapImg = pinned.locator('img.feed-snapshot').first();
    await expect(snapImg).toBeVisible({ timeout: 10_000 });
    const src = await snapImg.getAttribute('src');
    expect(src, 'snapshot renders as a data URL').toMatch(/^data:image\/jpeg;base64,/);
    const fresh = await page.evaluate(async (dataUrl) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const S = 32;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      if (!ctx) return { variance: -1, delta: -1 };
      ctx.drawImage(img, 0, 0, S, S);
      const px = ctx.getImageData(0, 0, S, S).data;
      let sum = 0, sum2 = 0, mn = 255, mx = 0;
      for (let i = 0; i < px.length; i += 4) {
        const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        sum += lum; sum2 += lum * lum;
        if (px[i] < mn) mn = px[i];
        if (px[i] > mx) mx = px[i];
      }
      const n = px.length / 4, mean = sum / n;
      return { variance: sum2 / n - mean * mean, delta: mx - mn };
    }, src!);
    expect(fresh.variance, 'snapshot canvas uniform/black (C7 bar)').toBeGreaterThanOrEqual(16);
    expect(fresh.delta).toBeGreaterThanOrEqual(16);
  });
});
