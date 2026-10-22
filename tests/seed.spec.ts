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
