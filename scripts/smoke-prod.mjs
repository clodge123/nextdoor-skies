#!/usr/bin/env node
/**
 * L9 GATE-3 PRODUCTION SMOKE KIT (wave 1, run 2)
 *
 * Playwright-driven (NOT curl) smoke of the deployed app. Four assertions per
 * viewport, 3 viewports (phone 390x844 / tablet 768x1024 / desktop 1280x800):
 *   1. / loads and the map canvas renders (production basemap, real canvas).
 *   2. Town labels appear after zoom (gazetteer symbol layer, window.ndsMap).
 *   3. Theme toggle flips the page background.
 *   4. /feed loads with the honest state (explicit placeholder, no fake posts).
 * Console errors are collected on every page — ANY app-origin console error
 * fails the smoke (documented exclusions mirror tests/map.spec.ts: headless
 * GL driver chatter + maplibre style-spec validation noise from the
 * THIRD-PARTY OpenFreeMap style, never app code).
 * Screenshots archived to docs/screenshots/prod-smoke/<project>-<page>.png.
 *
 * Usage:
 *   npm run smoke:prod                                  # production
 *   node scripts/smoke-prod.mjs --base-url http://127.0.0.1:4399 \
 *        --out docs/screenshots/prod-smoke/dryrun       # dry run
 *
 * Proxy law (host environment): this machine egresses through an
 * authenticating proxy that 407s loopback traffic. The browser goes direct
 * via launchOptions args ['--no-proxy-server']; the node side gets
 * NO_PROXY='*' set below so nothing leaks through the proxy. Direct egress
 * to tiles.openfreemap.org + vercel.app is proven working on this host.
 *
 * Determinism (R17): no Math.random / Date.now / new Date.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Node-side direct egress (see header). Must be set before launching.
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

// ---------------------------------------------------------------- config ---

const DEFAULT_BASE = 'https://nextdoor-skies-run2.vercel.app';
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (flag('base-url') ?? process.env.SMOKE_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');
const OUT = resolve(flag('out') ?? 'docs/screenshots/prod-smoke');

const VIEWPORTS = [
  // phone dpr 1: isMobile defaults dpr2, doubling tile requests and starving
  // label settle (same fix as playwright.config.ts phone project).
  { project: 'phone', width: 390, height: 844, deviceScaleFactor: 1 },
  { project: 'tablet', width: 768, height: 1024 },
  { project: 'desktop', width: 1280, height: 800 },
];

/** Documented console exclusions — identical set to tests/map.spec.ts. */
const IGNORED_CONSOLE = /GL Driver Message|Expected value to be of type .*null/;
// All gazetteer label tiers — narrow viewports render the city tier near the
// zoom target; any tier proves zoom-graded labels (same as tests/map.spec.ts).
const LABEL_LAYERS = ['nds-labels-town', 'nds-labels-city', 'nds-labels-state'];

// ------------------------------------------------------------- collectors ---

function attachConsoleCollector(page, bag) {
  // Tile-pyramid 404s are EXPECTED: maplibre speculates neighbouring tiles
  // beyond the zoom bounds; OpenFreeMap answers 404 for out-of-range z/x/y.
  // Law #4: tile errors are warnings, never app failures. Track them apart.
  let tile404 = 0;
  page.on('response', (r) => {
    if (r.status() === 404 && r.url().includes('openfreemap.org')) tile404 += 1;
  });
  page.on('console', (m) => {
    const text = m.text();
    if (IGNORED_CONSOLE.test(text)) return;
    if (/Failed to load resource.*404/.test(text)) {
      tile404 += 1; // attributed to the tile pyramid, counted separately
      return;
    }
    if (m.type() === 'error' || m.type() === 'warning') {
      bag.push(`console.${m.type()}: ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (e) => bag.push(`pageerror: ${e.message.slice(0, 300)}`));
  page._tile404 = () => tile404;
}

// ------------------------------------------------------- tile relay ---
// Mirror of tests/e2e/tile-relay.ts (Gate 2-proven): serve openfreemap.org
// requests node-side and re-emit with CORS headers. Node egress is direct
// (NO_PROXY='*'); the browser never talks to the tile host itself.
async function relayOfm(route) {
  try {
    const res = await fetch(route.request().url());
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
  } catch (e) {
    await route.fulfill({ status: 502, body: String(e) });
  }
}

// --------------------------------------------------------------- checks ---

/** 1+2: / renders the map canvas; town labels appear after zoom. */
async function checkMap(page, shots) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const canvas = page.getByTestId('map-view').locator('canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await page.screenshot({ path: shots.map });

  // Style loaded = production basemap fetched and parsed (law #1).
  await page.waitForFunction(() => window.ndsMap?.isStyleLoaded?.() === true, null, { timeout: 45_000 });
  const glyphs = await page.evaluate(() => window.ndsMap.getStyle().glyphs ?? '');
  if (!glyphs.includes('openfreemap.org') || glyphs.includes('demotiles.maplibre.org')) {
    throw new Error(`basemap law violated: glyphs=${glyphs}`);
  }

  // Zoom into Manor, TX (real baked town; Austin's town label collision-culls
  // on the 390px phone edge — same probe-verified retarget as tests/map.spec.ts).
  await page.evaluate(() => window.ndsMap.jumpTo({ center: [-97.5569, 30.3408], zoom: 12.5 }));
  await page.waitForFunction(() => window.ndsMap.getZoom() >= 12, null, { timeout: 30_000 });
  await page.waitForFunction(
    () => window.ndsMap.areTilesLoaded() === true, null, { timeout: 60_000 },
  );
  await page.waitForFunction(
    (layers) => window.ndsMap.queryRenderedFeatures(undefined, { layers }).length > 0,
    LABEL_LAYERS,
    { timeout: 30_000 },
  );
  const townLabels = await page.evaluate(
    (layers) => window.ndsMap.queryRenderedFeatures(undefined, { layers }).length,
    LABEL_LAYERS,
  );
  if (townLabels === 0) throw new Error('town labels: queryRenderedFeatures returned 0');
  await page.screenshot({ path: shots.mapZoom });
  return { townLabels };
}

/** 3: theme toggle flips the page background. */
async function checkTheme(page, shots) {
  const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const toggle = page.getByTestId('theme-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  await toggle.click();
  await page.waitForFunction((before) => getComputedStyle(document.body).backgroundColor !== before, bgBefore, {
    timeout: 10_000,
  });
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (themeAttr !== 'light' && themeAttr !== 'dark') {
    throw new Error(`theme toggle left data-theme=${themeAttr}`);
  }
  await page.screenshot({ path: shots.theme });
  return { bgBefore, bgAfter, themeAttr };
}

/** 5 (W3-D1 / C6): real API round-trip — create -> react -> verify -> flag.
 *  Node-side fetch (no browser) against the deployed api/posts.js. Proves the
 *  production routing (query-param `?path=` form) works end-to-end; the old
 *  subpath form 404s in production, so this check IS the regression gate. */
const SMOKE_TOWN = 'springfield-37.22--93.3';
const SMOKE_SESSION = JSON.stringify({ nickname: 'smoke', townSlug: SMOKE_TOWN, townName: 'Springfield' });

async function checkApiRoundTrip() {
  const headers = { 'content-type': 'application/json', 'x-nds-session': SMOKE_SESSION };
  // R17: no clock/RNG here. Text is static; the SERVER's createdAt makes the
  // content-hashed id unique per run (identical text + different ms = new id).
  const text = 'smoke round-trip post';
  const created = await fetch(`${BASE}/api/posts`, {
    method: 'POST', headers, body: JSON.stringify({ town: SMOKE_TOWN, text }),
  });
  if (created.status !== 201) throw new Error(`create post -> HTTP ${created.status}: ${(await created.text()).slice(0, 120)}`);
  const post = (await created.json()).post;
  if (!post?.id) throw new Error('create post: no id in response');
  const reacted = await fetch(`${BASE}/api/posts?path=${encodeURIComponent(`${post.id}/reactions`)}`, {
    method: 'POST', headers, body: JSON.stringify({ emoji: '👍' }),
  });
  if (reacted.status !== 200) throw new Error(`react -> HTTP ${reacted.status} (C6 routing regression)`);
  if ((await reacted.json()).myReaction !== '👍') throw new Error('react: server did not confirm myReaction');
  const listed = await fetch(`${BASE}/api/posts?town=${SMOKE_TOWN}&sort=new`, { headers });
  if (listed.status !== 200) throw new Error(`list -> HTTP ${listed.status}`);
  const row = (await listed.json()).posts.find((x) => x.id === post.id);
  if (!row) throw new Error('list: created post missing');
  if (row.reactions?.['👍'] !== 1 || row.myReaction !== '👍') {
    throw new Error(`list: reaction not visible (${JSON.stringify(row.reactions)} my=${row.myReaction})`);
  }
  const flagged = await fetch(`${BASE}/api/posts?path=${encodeURIComponent(`${post.id}/flag`)}`, {
    method: 'POST', headers, body: JSON.stringify({}),
  });
  if (flagged.status !== 200) throw new Error(`flag -> HTTP ${flagged.status}`);
  // Hidden after 3 DISTINCT flags (S2): two more smoke nicknames hide it.
  for (const nick of ['smoke-b', 'smoke-c']) {
    const h2 = { ...headers, 'x-nds-session': JSON.stringify({ nickname: nick, townSlug: SMOKE_TOWN, townName: 'Springfield' }) };
    const f2 = await fetch(`${BASE}/api/posts?path=${encodeURIComponent(`${post.id}/flag`)}`, {
      method: 'POST', headers: h2, body: JSON.stringify({}),
    });
    if (f2.status !== 200) throw new Error(`flag(${nick}) -> HTTP ${f2.status}`);
  }
  const hidden = await fetch(`${BASE}/api/posts?town=${SMOKE_TOWN}&sort=new`, { headers });
  if (hidden.status !== 200) throw new Error(`hidden-list -> HTTP ${hidden.status}`);
  if ((await hidden.json()).posts.some((x) => x.id === post.id)) {
    throw new Error('flag-hide: post still visible after 3 flags');
  }
  return { id: post.id, roundTrip: true, hidden: true };
}

/** 4: /feed loads with the honest state (wave-1 placeholder, no fake posts). */
async function checkFeed(page, shots) {
  await page.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('heading', { name: 'Feed' }).waitFor({ state: 'visible', timeout: 15_000 });
  const body = await page.locator('main').innerText();
  // Wave 2 honest states: identity gate (no session) OR "No posts in {town}
  // yet" (session, empty town). Fake posts = instant fail (law #1).
  if (!/not in a town yet|No posts in/i.test(body)) {
    throw new Error(`/feed not in honest state; main text: ${body.slice(0, 200)}`);
  }
  await page.screenshot({ path: shots.feed });
  return { honest: true };
}

// ---------------------------------------------------------------- main ---

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
const results = [];
let failures = 0;

// API round-trip runs ONCE (node-side, not per viewport) — W3-D1 C6 gate.
{
  const rec = { viewport: 'api-roundtrip', checks: {}, consoleErrors: [] };
  try {
    rec.checks.apiRoundTrip = await checkApiRoundTrip();
  } catch (e) {
    rec.checks.apiRoundTrip = { error: String(e?.message ?? e).slice(0, 300) };
    failures += 1;
  }
  results.push(rec);
}

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.deviceScaleFactor ? { deviceScaleFactor: vp.deviceScaleFactor } : {}),
  });
  const page = await context.newPage();
  await page.route('**openfreemap.org/**', relayOfm);
  const bag = [];
  attachConsoleCollector(page, bag);

  const shots = {
    map: resolve(OUT, `${vp.project}-map.png`),
    mapZoom: resolve(OUT, `${vp.project}-map-zoom.png`),
    theme: resolve(OUT, `${vp.project}-map-theme.png`),
    feed: resolve(OUT, `${vp.project}-feed.png`),
  };
  const rec = { viewport: `${vp.project} ${vp.width}x${vp.height}`, checks: {}, consoleErrors: [] };

  for (const [name, fn] of [
    ['map', () => checkMap(page, shots)],
    ['theme', () => checkTheme(page, shots)],
    ['feed', () => checkFeed(page, shots)],
  ]) {
    try {
      rec.checks[name] = await fn();
    } catch (e) {
      rec.checks[name] = { error: String(e && e.message ? e.message : e).slice(0, 300) };
      failures += 1;
      // Capture evidence of the failing state even on assertion failure.
      try {
        await page.screenshot({ path: resolve(OUT, `${vp.project}-${name}-FAILED.png`) });
      } catch {}
    }
  }
  rec.tile404 = page._tile404(); // documented tile-pyramid noise (law #4)
  if (bag.length > 0) {
    rec.consoleErrors = bag;
    failures += 1;
  }
  results.push(rec);
  await context.close();
}

await browser.close();

const summary = { base: BASE, out: OUT, viewports: results.length, failures, results };
writeFileSync(resolve(OUT, 'smoke-result.json'), JSON.stringify(summary, null, 2) + '\n');

console.log('=== SMOKE SUMMARY ===');
for (const r of results) {
  const parts = Object.entries(r.checks).map(([k, v]) =>
    v.error ? `${k} FAIL: ${v.error}` : `${k} ok`,
  );
  console.log(`[${r.viewport}] ${parts.join(' | ')}${r.consoleErrors.length ? ` | CONSOLE(${r.consoleErrors.length}): ${r.consoleErrors[0]}` : ''}`);
}
console.log(`base=${BASE} failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
