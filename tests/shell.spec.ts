// W3-C1 LAYOUT-SHELL — Gate 1 browser spec (one spec, 3 viewports via projects).
// Drives the REAL app (root vite project via scripts/e2e-serve.mjs).
//
// Asserts the session-3 layout rulings:
//   1. Right side panel: ~360px docked beside the map, OPEN by default on
//      desktop/tablet, COLLAPSED bottom sheet on phone (drag handle), with
//      the honest "Nothing to show yet" empty state (slot fills in B2/C2).
//      Keyboard `P` toggles; the map-edge button toggles; ~200ms transition
//      (animation law — nothing snaps).
//   2. Alert banner overlay is GONE from the map page (alert center lands in
//      C2). The /api/alerts refresher keeps polling (stubbed here) for the
//      badge dots — zero real NWS calls.
//   3. Phone header drawer: hamburger -> Map / Feed / Alerts / Theme, all
//      >=44px targets; nav works, Escape closes, Alerts opens the sheet.
//
// Console-clean with the documented exclusions (GL driver + third-party
// style-spec chatter). Open-Meteo + /api/alerts stubbed; OpenFreeMap tiles
// relayed node-side (host egress proxy strips CORS), same as badges.spec.ts.
import { expect, test, type Page, type Route } from '@playwright/test';
import * as path from 'node:path';
import { mkdirSync } from 'node:fs';

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W3-C1');
const IGNORED = /GL Driver Message|Expected value to be of type .*null/;

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (IGNORED.test(t)) return;
    if (msg.type() === 'error') errors.push(t);
  });
  page.on('pageerror', (err) => {
    const t = String(err);
    if (!IGNORED.test(t)) errors.push(t);
  });
  return errors;
}

async function relayOfm(route: Route) {
  const url = route.request().url();
  // Fixed-backoff retries (deterministic, no randomness): the host egress
  // proxy intermittently 502s tile/glyph fetches; without this maplibre
  // reports console warnings the gate would count.
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

/** Weather proxy: no temps (panel/map surfaces stay quiet; badges not asserted). */
async function stubWeather(page: Page): Promise<void> {
  await page.route(/\/api\/weather\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ temps: {}, stale: false }),
    });
  });
}

/** Alerts refresher keeps polling per window — stub it clear (zero NWS). */
async function stubAlerts(page: Page): Promise<void> {
  await page.route(/\/api\/alerts\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ alerts: [], stale: false }),
    });
  });
}

async function setup(page: Page): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const errors = attachConsoleCollector(page);
  await page.route('**tiles.openfreemap.org/**', relayOfm);
  await stubWeather(page);
  await stubAlerts(page);
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  );
  return errors;
}

async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap();
  else await locator.click();
}

test.describe('W3-C1 layout shell', () => {
  test('side panel: default state, geometry, P toggle, honest empty state', async ({ page }, testInfo) => {
    const errors = await setup(page);
    const panel = page.getByTestId('side-panel');

    // Session-3 ruling: open by default on desktop/tablet, collapsed sheet
    // on phone.
    if (testInfo.project.name === 'phone') {
      await expect(panel).toHaveAttribute('data-open', 'false');
      await expect(panel).toHaveClass(/is-collapsed/);
      // Bottom sheet: drag handle is the visible affordance, >=36px tall.
      const handle = page.getByTestId('panel-handle');
      await expect(handle).toBeVisible();
      const hb = await handle.boundingBox();
      expect(hb!.height).toBeGreaterThanOrEqual(36);
      // Tap the handle -> sheet expands with the honest empty state.
      await tapOrClick(page, handle);
      await expect(panel).toHaveAttribute('data-open', 'true');
      await expect(page.getByTestId('panel-empty')).toBeVisible();
    } else {
      // Desktop/tablet: docked column, ~360px, visible, empty slot honest.
      await expect(panel).toHaveAttribute('data-open', 'true');
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(340);
      expect(box!.width).toBeLessThanOrEqual(380);
      // Docked BESIDE the map (right edge), not over it.
      const mapBox = await page.getByTestId('map-view').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(mapBox!.x + mapBox!.width - 2);
      await expect(page.getByTestId('panel-empty')).toBeVisible();
      await expect(page.getByTestId('panel-empty')).toContainText('Nothing to show yet');

      // Keyboard law: P collapses, P again re-opens. ~200ms transition.
      const dur = await panel.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(dur).toContain('0.2s');
      await page.keyboard.press('p');
      await expect(panel).toHaveAttribute('data-open', 'false');
      await page.keyboard.press('p');
      await expect(panel).toHaveAttribute('data-open', 'true');

      // Map-edge toggle button mirrors the keyboard.
      await tapOrClick(page, page.getByTestId('panel-toggle'));
      await expect(panel).toHaveAttribute('data-open', 'false');
      await tapOrClick(page, page.getByTestId('panel-toggle'));
      await expect(panel).toHaveAttribute('data-open', 'true');
    }

    // Square geometry law (R20): panel chrome uses var(--radius) (=0px).
    await expect(panel).toHaveCSS('border-radius', '0px');

    await page.screenshot({ path: path.join(SHOT_DIR, `panel-${testInfo.project.name}.png`) });
    expect(errors).toEqual([]);
  });

  test('alert banner overlay is gone from the map page', async ({ page }) => {
    const errors = await setup(page);
    // Banner unmounted (alert center lands in C2); the refresher keeps
    // polling for badge dots, so no banner element may exist in any viewport.
    await expect(page.getByTestId('alert-banner')).toHaveCount(0);
    // And the map itself is unobstructed: canvas renders under the header.
    await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('phone header drawer: hamburger -> Map/Feed/Alerts/Theme, 44px, nav works', async ({ page }, testInfo) => {
    const errors = await setup(page);
    const drawer = page.getByTestId('nav-drawer');
    const burger = page.getByTestId('nav-menu-button');

    if (testInfo.project.name !== 'phone') {
      // Hamburger is phone-only; inline nav stays on tablet/desktop.
      await expect(burger).toBeHidden();
      expect(errors).toEqual([]);
      return;
    }

    // Collapsed: drawer closed, hamburger >=44px.
    await expect(drawer).toHaveAttribute('data-open', 'false');
    await expect(burger).toBeVisible();
    const bb = await burger.boundingBox();
    expect(bb!.width).toBeGreaterThanOrEqual(44);
    expect(bb!.height).toBeGreaterThanOrEqual(44);

    // Open: all four items present, every one >=44px tall.
    await tapOrClick(page, burger);
    await expect(drawer).toHaveAttribute('data-open', 'true');
    const items = ['map', 'feed', 'alerts', 'theme'];
    for (const item of items) {
      const el = page.locator(`[data-drawer-item="${item}"]`).first();
      await expect(el).toBeVisible();
      const b = await el.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }

    // Nav works: Feed -> feed page renders, drawer closes.
    await tapOrClick(page, page.locator('[data-drawer-item="feed"]'));
    await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();
    await expect(drawer).toHaveAttribute('data-open', 'false');

    // Back to map; Alerts opens the collapsed bottom sheet (C2 seam).
    await tapOrClick(page, page.locator('.app-nav a[data-route="/"]').first());
    await expect(page.getByTestId('map-view')).toBeVisible();
    await tapOrClick(page, burger);
    await tapOrClick(page, page.locator('[data-drawer-item="alerts"]'));
    await expect(page.getByTestId('side-panel')).toHaveAttribute('data-open', 'true');
    await expect(drawer).toHaveAttribute('data-open', 'false');

    // Escape closes the drawer.
    await tapOrClick(page, burger);
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveAttribute('data-open', 'false');

    await page.screenshot({ path: path.join(SHOT_DIR, `drawer-${testInfo.project.name}.png`) });
    expect(errors).toEqual([]);
  });
});
