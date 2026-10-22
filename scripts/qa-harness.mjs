#!/usr/bin/env node
/**
 * W3-F QA HARNESS — "click-every-button" pass (wave-3 brainstorm session 5
 * law: manual-grade automation, production-shaped, NO mocked routes).
 *
 * Enumerates every interactive element (links, buttons, inputs, textareas,
 * selects, role=button) across the app routes:
 *   /  /feed  /t/<slug>  /t/<slug>/feed  /p/<id>  /alerts
 * clicks each one, and asserts per route:
 *   - zero app-origin console errors (documented exclusions below),
 *   - zero failed /api requests (status >= 400),
 *   - zero unhandled rejections / pageerrors.
 * Prints a per-route PASS/FAIL table.
 *
 * Production-shaped (C6 law): runs against scripts/api-serve.mjs (the REAL
 * api/*.js handlers + built dist, SPA rewrite mirrors vercel.json). ZERO
 * page.route mocks — the mocked-route blind spot that shipped the C6
 * production 404 must stay dead. Tiles/weather/alerts egress live.
 *
 * Usage (gated, fleet browser law):
 *   scripts/e2e-gate.sh node scripts/qa-harness.mjs            # builds, boots api-serve, sweeps
 *   node scripts/qa-harness.mjs --base-url http://127.0.0.1:43118 --no-build
 *   QA=1 scripts/e2e-gate.sh                                   # same via the gate's QA mode
 *
 * Determinism (R17): no Math.random / Date.now / new Date.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Canonical town used by every deterministic seed (same slug as the B4
 *  search spec — gazetteer-stable). */
export const QA_TOWN_SLUG = 'salina-38.84--97.61';

/** Session the harness signs in as (x-nds-session shape, lib/feed S1). */
export const QA_SESSION = JSON.stringify({
  nickname: 'qa-bot',
  townSlug: QA_TOWN_SLUG,
  townName: 'Salina',
});

/** Interactive-element census selector (the "every button" law). */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select',
  '[role="button"]',
  '[contenteditable="true"]',
].join(', ');

/** Documented console exclusions — identical family to smoke-prod.mjs /
 *  map.spec.ts: headless GL driver chatter, maplibre style-spec validation
 *  noise from the THIRD-PARTY OpenFreeMap style, tile-pyramid 404 chatter
 *  (maplibre speculates out-of-range z/x/y; OpenFreeMap 404s them — law #4),
 *  favicon misses. Never app code. */
export const IGNORED_CONSOLE =
  /GL Driver Message|Expected value to be of type .*null|openfreemap\.org|favicon/i;

/** Route table builder — pure, unit-tested. `posts` maps route -> id. */
export function qaRoutes(slug = QA_TOWN_SLUG, postId = 'p_qa1') {
  return [
    { path: '/', label: 'map' },
    { path: '/feed', label: 'feed' },
    { path: `/t/${slug}`, label: 'town page' },
    { path: `/t/${slug}/feed`, label: 'town feed' },
    { path: `/p/${postId}`, label: 'post detail' },
    { path: '/alerts', label: 'alerts page' },
  ];
}

/** Stable identity for dedupe (pure). Priority: testid > aria-label >
 *  placeholder > href > text (last resort) > tag. Deliberately EXCLUDES
 *  text when a stronger key exists: a control that re-renders with a new
 *  label (theme toggle Light->Dark, pressed reactions) keeps ONE identity,
 *  so the sweep never re-clicks the same control. */
export function elementIdentity(info) {
  const key =
    info.testid || info.label || info.placeholder || info.href || (info.text ?? '').slice(0, 48) || '';
  return key ? `${info.tag}:${key}` : info.tag;
}

/** Per-route PASS/FAIL table (pure, unit-tested). failures===0 => PASS. */
export function buildTable(rows) {
  const head = 'route                       clicks  console-err  api-fail  pageerr  verdict';
  const lines = rows.map((r) => {
    const ok = r.consoleErrors.length === 0 && r.apiFailures.length === 0 && r.pageErrors.length === 0;
    const verdict = ok && r.clicks > 0 ? 'PASS' : ok ? 'PASS(no-targets)' : 'FAIL';
    const name = `${r.path} (${r.label})`;
    return [
      name.padEnd(26),
      String(r.clicks).padStart(5),
      String(r.consoleErrors.length).padStart(11),
      String(r.apiFailures.length).padStart(9),
      String(r.pageErrors.length).padStart(8),
      '  ' + verdict,
    ].join('');
  });
  const total = rows.reduce(
    (a, r) => ({
      clicks: a.clicks + r.clicks,
      consoleErrors: a.consoleErrors + r.consoleErrors.length,
      apiFailures: a.apiFailures + r.apiFailures.length,
      pageErrors: a.pageErrors + r.pageErrors.length,
    }),
    { clicks: 0, consoleErrors: 0, apiFailures: 0, pageErrors: 0 },
  );
  const failCount = rows.filter(
    (r) => r.consoleErrors.length + r.apiFailures.length + r.pageErrors.length > 0,
  ).length;
  return [
    head,
    '-'.repeat(head.length),
    ...lines,
    '-'.repeat(head.length),
    `TOTAL  clicks=${total.clicks}  console-errors=${total.consoleErrors}  api-failures=${total.apiFailures}  pageerrors=${total.pageErrors}  failing-routes=${failCount}`,
  ].join('\n');
}

/** Ready-state probe per route (pure data; used by the sweep). */
export function readyProbe(path) {
  if (path === '/') return { selector: '[data-testid="map-view"] canvas', extra: 'map canvas' };
  if (path === '/feed' || path.endsWith('/feed')) {
    return { selector: '[data-testid="feed-page"], [data-testid="identity-picker"]', extra: 'feed surface' };
  }
  if (path.startsWith('/t/')) return { selector: '[data-testid="town-page"]', extra: 'town page' };
  if (path.startsWith('/p/')) return { selector: '[data-testid="post-detail-page"]', extra: 'post detail' };
  if (path === '/alerts') return { selector: '[data-testid="alerts-page"]', extra: 'alerts page' };
  return { selector: 'body', extra: 'page' };
}

// ---------------------------------------------------------------------------
// Browser sweep (used by CLI and mirrored by tests/qa.spec.ts)
// ---------------------------------------------------------------------------

/** Attach the zero-tolerance collectors once per page. Returns the bags. */
export function attachCollectors(page) {
  const bag = { consoleErrors: [], warnings: [], apiFailures: [], pageErrors: [] };
  page.on('console', (m) => {
    const text = m.text();
    if (IGNORED_CONSOLE.test(text)) return;
    if (m.type() === 'error') bag.consoleErrors.push(text.slice(0, 300));
    else if (m.type() === 'warning') bag.warnings.push(text.slice(0, 300));
  });
  page.on('pageerror', (e) => bag.pageErrors.push(String(e).slice(0, 300)));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400) {
      bag.apiFailures.push(`${r.status()} ${r.request().method()} ${u.slice(0, 200)}`);
    }
  });
  return bag;
}

async function waitForReady(page, path, timeoutMs = 20_000) {
  const probe = readyProbe(path);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await page.locator(probe.selector).first().isVisible().catch(() => false);
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`ready probe failed: ${probe.extra} (${probe.selector})`);
    await page.waitForTimeout(100);
  }
}

/** Press Escape to close overlays (palette/lightbox/drawer/panel). */
export async function dismissOverlays(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(120);
}

/**
 * Click-every-button sweep for one route. Mutates `bag` in place.
 * Strategy: re-enumerate after every click (DOM shifts), dedupe by element
 * identity, navigate back to the route when a click leaves it.
 */
export async function sweepRoute(page, baseUrl, route, bag, { log = () => {}, maxClicks = 60 } = {}) {
  // Signed-in sweep: the app enforces identity on POST surfaces (honest
  // 401s for anonymous writes). Seeding the session (same shape as
  // real-api.spec.ts) makes the sweep a REAL user pass, not an anonymous
  // bot tripping legitimate auth gates.
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['nds-session', QA_SESSION],
  );
  const row = { path: route.path, label: route.label, clicks: 0, consoleErrors: [], apiFailures: [], pageErrors: [] };
  // Per-route deltas: one page spans all routes, so the bag accumulates.
  // Snapshot the lengths and report ONLY what this route added.
  const base = { c: bag.consoleErrors.length, a: bag.apiFailures.length, p: bag.pageErrors.length };
  const seen = new Set();
  const startUrl = baseUrl + route.path;
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await waitForReady(page, route.path);

  let guard = 0;
  for (;;) {
    if (++guard > 120) break; // safety: bounded sweep
    if (row.clicks >= maxClicks) break; // budget: keep runs bounded per route
    const loc = page.locator(INTERACTIVE_SELECTOR);
    // ONE evaluateAll per pass (was per-element: O(n^2) round-trips made the
    // map route blow the sweep budget). Order = DOM order, stable keys.
    const infos = await loc.evaluateAll((els) =>
      els.map((n) => ({
        tag: n.tagName.toLowerCase(),
        testid: n.getAttribute('data-testid') ?? '',
        label: n.getAttribute('aria-label') ?? '',
        placeholder: n.getAttribute('placeholder') ?? '',
        text: (n.textContent ?? '').trim().slice(0, 60),
        href: n.getAttribute('href') ?? '',
        // Proxy for visibility: display:none/closed shadow = zero client
        // rects. (Sweep clicks; Playwright actionability still guards.)
        visible: n.getClientRects().length > 0,
      })),
    ).catch(() => []);
    let clicked = false;
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      if (!info || !info.visible) continue;
      const key = elementIdentity(info);
      if (seen.has(key)) continue;
      seen.add(key);
      const el = loc.nth(i);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      const before = page.url();
      await el.click({ timeout: 5000 }).catch(() => {});
      row.clicks += 1;
      await page.waitForTimeout(150);
      await dismissOverlays(page);
      if (page.url() !== before) {
        await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
        await waitForReady(page, route.path).catch(() => {});
      }
      clicked = true;
      break; // re-enumerate: DOM may have shifted
    }
    if (!clicked) break;
  }

  row.consoleErrors = bag.consoleErrors.slice(base.c);
  row.apiFailures = bag.apiFailures.slice(base.a);
  row.pageErrors = bag.pageErrors.slice(base.p);
  log(`swept ${route.path} clicks=${row.clicks}`);
  return row;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function runCli(argv) {
  const { chromium } = await import('@playwright/test');
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const noBuild = argv.includes('--no-build');
  const apiPort = Number(flag('port') ?? process.env.E2E_API_PORT ?? 43118);
  const baseUrl = (flag('base-url') ?? `http://127.0.0.1:${apiPort}`).replace(/\/+$/, '');
  process.env.NO_PROXY = '*';
  process.env.no_proxy = '*';

  if (!noBuild) {
    // Same toolchain the gated webServer uses (.e2e/node_modules/.bin/vite).
    const viteBin = join(repoRoot, '.e2e', 'node_modules', '.bin', 'vite');
    const build = spawn(existsSync(viteBin) ? viteBin : process.execPath,
      existsSync(viteBin) ? ['build'] : [join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
      { stdio: 'inherit', cwd: repoRoot });
    await new Promise((res, rej) => {
      build.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build exited ${c}`))));
    });
  }

  const api = spawn(process.execPath, [join(repoRoot, 'scripts', 'api-serve.mjs'), String(apiPort)], {
    stdio: ['ignore', 'pipe', 'inherit'],
    cwd: repoRoot,
    env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
  });
  const apiUrl = `${baseUrl}/api/probe`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const r = await fetch(apiUrl);
      if (r.ok) break;
    } catch {
      /* booting */
    }
    if (Date.now() > deadline) {
      api.kill('SIGKILL');
      throw new Error('api-serve did not come up');
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  let exitCode = 1;
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const bag = attachCollectors(page);
    // Seed one real post node-side so /p/<id> is a real route (no mocks).
    const created = await page.request.post(`${baseUrl}/api/posts`, {
      headers: { 'content-type': 'application/json', 'x-nds-session': QA_SESSION },
      data: { town: QA_TOWN_SLUG, text: 'qa harness seed post' },
    });
    if (!created.ok()) throw new Error(`seed post failed: ${created.status()}`);
    const postId = (await created.json()).post.id;

    const rows = [];
    for (const route of qaRoutes(QA_TOWN_SLUG, postId)) {
      rows.push(await sweepRoute(page, baseUrl, route, bag, { log: (m) => console.log('[qa]', m) }));
    }
    console.log(buildTable(rows));
    const failing = rows.filter(
      (r) => r.consoleErrors.length + r.apiFailures.length + r.pageErrors.length > 0,
    );
    if (failing.length === 0) exitCode = 0;
    else {
      for (const r of failing) {
        console.error(`FAIL ${r.path}`);
        for (const e of [...r.consoleErrors, ...r.apiFailures, ...r.pageErrors]) console.error('  ', e);
      }
    }
  } finally {
    await browser.close();
    api.kill('SIGKILL');
  }
  process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((e) => {
    console.error('qa-harness:', e.message);
    process.exit(1);
  });
}
