// W3-E2 FIRST-VISIT TOUR — Gate 1 browser spec (one spec, 3 viewport projects).
// Drives the REAL app (root vite project via scripts/e2e-serve.mjs).
//
// Session-5 law: quick 3-step spotlight tour, shown ONCE per unique user,
// replayable. Asserts:
//   1. Fresh context (clean localStorage) -> tour appears on map home.
//   2. Step order: welcome-map -> search -> panel-palette; Next x2 -> Done.
//   3. Seen-once: after Done, reload -> tour gone (localStorage flag).
//   4. Replay seams: palette command 'Show tour' (Ctrl+K) + phone drawer
//      item 'Take the tour' — both reopen the tour from step 1.
//   5. Non-blocking law: scrim click advances, Esc skips, buttons >=44px.
//   6. Route gate: tour auto-opens on map home only (never on /feed).
//
// Console-clean with documented exclusions (GL driver chatter). Open-Meteo +
// /api/alerts stubbed; OpenFreeMap tiles relayed node-side (host egress proxy
// strips CORS), same as palette.spec.ts. Zero real NWS/weather calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import * as path from 'node:path';
import { mkdirSync } from 'node:fs';

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W3-E2');
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

async function stubWeather(page: Page): Promise<void> {
  await page.route(/\/api\/weather\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ temps: {}, stale: false }),
    });
  });
}

async function stubAlerts(page: Page): Promise<void> {
  await page.route(/\/api\/alerts\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ alerts: [], stale: false }),
    });
  });
}

/** First-visit setup: NO seen-flag seeded — the tour is the subject. */
async function setup(page: Page): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const errors = attachConsoleCollector(page);
  await page.route('**tiles.openfreemap.org/**', relayOfm);
  await stubWeather(page);
  await stubAlerts(page);
  return errors;
}

async function gotoMap(page: Page): Promise<void> {
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 });
}

async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap();
  else await locator.click();
}

const tour = (page: Page) => page.getByTestId('tour');

/** W4-F1 geometry law: the tour box is fully inside the viewport (no clip). */
async function expectInsideViewport(page: Page): Promise<void> {
  const box = await page.getByTestId('tour-bubble').boundingBox();
  expect(box, 'tour bubble has a box').not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
}

/** W4-F1 geometry law: the bubble must not cover the targeted element. */
async function expectNotCovering(page: Page, selectors: readonly string[]): Promise<void> {
  // Resolve the target the SAME way the app does (first visible selector),
  // in-page — viewport-agnostic, no hasTouch assumptions.
  const target = await page.evaluate((sels) => {
    for (const sel of sels) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }
    }
    return null;
  }, selectors as string[]);
  if (!target) return; // no visible target at this size — nothing to cover
  const bubble = await page.getByTestId('tour-bubble').boundingBox();
  expect(bubble, 'bubble box').not.toBeNull();
  const overlap =
    bubble!.x < target.x + target.width &&
    target.x < bubble!.x + bubble!.width &&
    bubble!.y < target.y + target.height &&
    target.y < bubble!.y + bubble!.height;
  expect(overlap, `bubble must not cover ${selectors.join(' / ')}`).toBe(false);
}

test.describe('W3-E2 first-visit tour', () => {
  test('fresh visitor: tour appears; Next x2 -> Done; reload -> gone', async ({ page }, testInfo) => {
    const errors = await setup(page);
    await gotoMap(page);

    // First visit: the spotlight tour lands (~600ms after paint).
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await expect(tour(page)).toHaveAttribute('data-step-id', 'welcome-map');

    // W4-F1 copy law: step 1 references Fahrenheit BY DEFAULT + names the
    // header °F/°C toggle pill (the UnitToggle seam).
    const body1 = (await page.getByTestId('tour-body').textContent()) ?? '';
    expect(body1).toContain('°F');
    expect(body1).toContain('°C');
    expect(body1.toLowerCase()).toContain('pill');

    // W4-F1 geometry law (all viewports): box fully inside the viewport.
    // Step 1's target is the map (full-viewport) — last-resort placement
    // keeps the bubble visible; non-overlap is asserted on steps 2 + 3.
    await expectInsideViewport(page);

    // Bubble exposes honest step progress + >=44px controls.
    await expect(page.getByTestId('tour-hint')).toBeVisible();
    for (const id of ['tour-next', 'tour-skip']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // Step order: Next -> search -> panel-palette (last step swaps to Done).
    await tapOrClick(page, page.getByTestId('tour-next'));
    await expect(tour(page)).toHaveAttribute('data-step-id', 'search');
    // W4-F1 geometry: inside the viewport AND not covering the search box
    // (phone face = drawer button, same fallback law as the step itself).
    await expectInsideViewport(page);
    await expectNotCovering(page, [
      '[data-testid="town-search"]',
      '[data-testid="nav-menu-button"]',
    ]);
    await tapOrClick(page, page.getByTestId('tour-next'));
    await expect(tour(page)).toHaveAttribute('data-step-id', 'panel-palette');
    // W4-F1 geometry: not covering the panel (phone face = drawer button).
    await expectInsideViewport(page);
    await expectNotCovering(page, [
      '[data-testid="side-panel"]',
      '[data-testid="nav-menu-button"]',
    ]);
    await expect(page.getByTestId('tour-done')).toBeVisible();
    await page.screenshot({ path: path.join(SHOT_DIR, `tour-last-${testInfo.project.name}.png`) });

    // Done closes the tour and persists the seen flag.
    await tapOrClick(page, page.getByTestId('tour-done'));
    await expect(tour(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('nds-tour-seen'))).toBe('1');

    // Seen-once law: reload -> no tour (past the 600ms open delay).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(tour(page)).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('skip marks seen; scrim click advances (non-blocking law)', async ({ page }) => {
    const errors = await setup(page);
    await gotoMap(page);
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });

    // Scrim click advances one step (the tour never traps the pointer).
    await page.getByTestId('tour-scrim').click({ position: { x: 5, y: 5 } });
    await expect(tour(page)).toHaveAttribute('data-step', '1');

    // Esc skips: tour closes, flag set (shown once counts as shown).
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('nds-tour-seen'))).toBe('1');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await expect(tour(page)).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('palette "Show tour" replays for a returning visitor', async ({ page }) => {
    const errors = await setup(page);
    await gotoMap(page);
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    // Walk the script to the end (Done lives on the last step only).
    await tapOrClick(page, page.getByTestId('tour-next'));
    await tapOrClick(page, page.getByTestId('tour-next'));
    await tapOrClick(page, page.getByTestId('tour-done'));
    await expect(tour(page)).toHaveCount(0);

    // Replay seam 1: Ctrl/Cmd+K -> type 'tour' -> Enter runs 'Show tour'.
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('palette')).toBeVisible();
    await page.getByTestId('palette-input').fill('tour');
    const row = page.getByTestId('palette-row-show-tour');
    await expect(row).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(tour(page)).toBeVisible({ timeout: 5_000 });
    await expect(tour(page)).toHaveAttribute('data-step', '0');
    // Replay does NOT re-mark anything until it ends; skip to close.
    await tapOrClick(page, page.getByTestId('tour-skip'));
    await expect(tour(page)).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('phone drawer "Take the tour" replays; tour skips /feed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'drawer replay is the phone surface');
    const errors = await setup(page);
    await gotoMap(page);
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await tapOrClick(page, page.getByTestId('tour-skip'));

    // Replay seam 2: phone drawer item (the palette command's phone face).
    await tapOrClick(page, page.getByTestId('nav-menu-button'));
    await tapOrClick(page, page.locator('[data-drawer-item="tour"]'));
    await expect(tour(page)).toBeVisible({ timeout: 5_000 });
    await expect(tour(page)).toHaveAttribute('data-step', '0');
    await tapOrClick(page, page.getByTestId('tour-skip'));
    await expect(tour(page)).toHaveCount(0);

    // Route gate: tour auto-opens on map home only — /feed stays quiet.
    await page.evaluate(() => localStorage.removeItem('nds-tour-seen'));
    await page.goto('/feed', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await expect(tour(page)).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
