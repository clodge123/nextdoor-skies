// L5 Gate 1: real Chromium, production basemap (OpenFreeMap bright), zoom-tier
// gazetteer. 3 viewports via projects; console-clean collector; screenshot archived.
//
// Host-environment note: this machine egresses through an authenticating HTTP
// proxy that strips CORS headers, so the browser cannot fetch tiles directly.
// The test relays every tiles.openfreemap.org request node-side (Node honors
// the env proxy; NODE_EXTRA_CA_CERTS trusts it) and fulfills the route with
// CORS headers added. The app itself is unmodified and uses the real style URL.
import { expect, test, type Page, type Route } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { markTourSeen } from './tour-seed';

const OUT = 'docs/screenshots/L5-map';

/**
 * L12 wiring note: MapPage now feeds <TownBadges> via createWeatherRefresher,
 * so a zoom into town tier fires an Open-Meteo batch POST. This spec stubs
 * that endpoint (deterministic temps, no real network) so the console-clean
 * gate stays honest. No console-exclusion widening was needed for real-app
 * usage beyond the pre-existing style-validation/GL-driver exclusions below.
 */
// W1 wave-2: the app GETs the same-origin /api/weather proxy (S5); the old
// api.open-meteo.com/v1/batch POST endpoint never existed. Stub the proxy so
// this spec makes zero real weather calls (the badge pipeline is asserted in
// badges.spec.ts; here we only need silence + no console noise).
const WEATHER_URL = /\/api\/weather\?.*/;

function stubOpenMeteo(page: Page): Promise<void> {
  return page.route(WEATHER_URL, async (route) => {
    const response = { temps: {}, stale: false };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
}

// S6 wave-2: the map page polls /api/alerts per window. Stub it (clear) so
// this spec makes zero real NWS calls and the console gate stays clean.
function stubAlerts(page: Page): Promise<void> {
  return page.route(/\/api\/alerts\?.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [], stale: false }) });
  });
}

async function relayOfm(route: Route) {
  const url = route.request().url();
  // L12: the host egress proxy intermittently 502s glyph pbf/tile fetches,
  // which maplibre reports as console warnings and the console gate counts.
  // Retry a few times before giving up (fixed backoff, no randomness).
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
  // Tile errors stay warnings (law #4): 502 the route, UI must not flip.
  await route.fulfill({ status: 502, body: String(lastErr) });
}

function collectConsole(page: Page, bag: string[]) {
  // Documented exclusions (honest state, see docs/metrics/L5-map.md):
  // - GL Driver Message: headless swiftshader/ANGLE perf chatter.
  // - "Expected value to be of type ... null": emitted by maplibre
  //   style-spec validation while parsing the THIRD-PARTY OpenFreeMap style
  //   expressions (basemap layer attrs), never from app code. App-origin
  //   console output must be empty.
  const IGNORED = /GL Driver Message|Expected value to be of type .*null/;
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORED.test(t)) return;
    if (m.type() === 'error') bag.push(`console.error: ${t.slice(0, 300)}`);
    if (m.type() === 'warning') bag.push(`console.warning: ${t.slice(0, 300)}`);
  });
  page.on('pageerror', (e) => bag.push(`pageerror: ${e.message.slice(0, 300)}`));
}

test('map renders + zoom-in shows town label', async ({ page, browserName }, testInfo) => {
  // Phone (390px) relays every tile through the node-side proxy: style load +
  // tile settle can exceed the 30s default budget. Assertions unchanged; the
  // whole test just gets a longer clock (L12 wiring note).
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  const bag: string[] = [];
  collectConsole(page, bag);
  await page.route('**tiles.openfreemap.org/**', relayOfm);
  await stubOpenMeteo(page);

  await markTourSeen(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('map-view').locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // style loaded (production basemap, never demotiles)
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  );

  // zoom into Manor, TX (real baked town, tier=town) -> town-tier labels
  // visible. L12 note: the old center (Austin) put the only in-view town
  // label (Anderson Mill) exactly on the phone viewport's top edge, where
  // maplibre collision-culls it — phone saw labels=0 forever. Centering ON
  // a town-tier feature keeps the assertion viewport-independent.
  await page.evaluate(() => {
    (window as { ndsMap: { jumpTo: (o: object) => void } }).ndsMap.jumpTo({ center: [-97.5569, 30.3408], zoom: 12.5 });
  });
  await page.waitForFunction(() => (window as { ndsMap: { getZoom: () => number } }).ndsMap.getZoom() >= 12);
  // let tiles + symbol labels settle (narrow viewports need more render time)
  await page.waitForFunction(() => {
    const m = (window as { ndsMap: { areTilesLoaded: () => boolean; queryRenderedFeatures: (b?: object, o?: object) => unknown[] } }).ndsMap;
    return m.areTilesLoaded() === true && m.queryRenderedFeatures(undefined, { layers: ['nds-labels-town'] }).length > 0;
  }, null, { timeout: 60_000 });
  await page.waitForTimeout(1000);

  const townLabels = await page.evaluate(() =>
    (window as { ndsMap: { queryRenderedFeatures: (b?: object, o?: object) => unknown[] } }).ndsMap.queryRenderedFeatures(undefined, { layers: ['nds-labels-town'] }).length,
  );
  expect(townLabels).toBeGreaterThan(0);

  const glyphs = await page.evaluate(() =>
    JSON.stringify((window as { ndsMap: { getStyle: () => { glyphs?: string } } }).ndsMap.getStyle().glyphs ?? ''),
  );
  expect(glyphs).toContain('openfreemap.org');
  expect(glyphs).not.toContain('demotiles.maplibre.org');

  await page.screenshot({ path: `${OUT}/map-${browserName}-${testInfo.project.name}.png` });

  expect(bag, `console output:\n${bag.join('\n')}`).toEqual([]);
});
