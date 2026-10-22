// W3-C3 COMMAND PALETTE — Gate 1 browser spec (one spec, 3 viewport projects).
// Drives the REAL app (root vite project via scripts/e2e-serve.mjs).
//
// Session-3 ruling (decision 4): Ctrl/Cmd+K command palette for power users.
// Asserts:
//   1. Ctrl/Cmd+K opens the palette (portal overlay, dialog role).
//   2. Type 'theme' -> filter narrows to the theme command -> Enter toggles
//      html[data-theme] and closes; Esc closes without running.
//   3. Keyboard nav: ArrowDown moves the highlight, Enter runs.
//   4. Discoverability: desktop/tablet header shows the ⌘K chip (clickable,
//      >=44px); phone hides the chip (CSS) and exposes the drawer item.
//   5. Scrim click closes (click outside the dialog).
//
// Console-clean with documented exclusions (GL driver chatter). Open-Meteo +
// /api/alerts stubbed; OpenFreeMap tiles relayed node-side (host egress proxy
// strips CORS), same as shell.spec.ts. Zero real NWS/weather calls.
import { expect, test, type Page, type Route } from '@playwright/test';
import * as path from 'node:path';
import { mkdirSync } from 'node:fs';

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W3-C3');
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

async function setup(page: Page): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const errors = attachConsoleCollector(page);
  await page.route('**tiles.openfreemap.org/**', relayOfm);
  await stubWeather(page);
  await stubAlerts(page);
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 });
  return errors;
}

async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap();
  else await locator.click();
}

/** Ctrl+K (Linux Chromium has no Meta-as-Cmd; the app accepts both). */
async function pressPaletteKey(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
}

test.describe('W3-C3 command palette', () => {
  test('Ctrl+K opens; type theme -> Enter toggles theme; Esc closes', async ({ page }, testInfo) => {
    const errors = await setup(page);
    const palette = page.getByTestId('palette');

    // Closed by default.
    await expect(palette).toHaveCount(0);

    // Ctrl+K opens the palette (power-user gesture).
    await pressPaletteKey(page);
    await expect(palette).toBeVisible();
    await expect(page.getByTestId('palette-input')).toBeFocused();
    // Honest empty recents state + full command list with shortcut hints.
    await expect(page.getByTestId('palette-recents-empty')).toBeVisible();
    await expect(page.getByTestId('palette-row-toggle-panel')).toContainText('P');

    // Filter: type 'theme' narrows to the theme command.
    await page.getByTestId('palette-input').fill('theme');
    await expect(page.getByTestId('palette-row-toggle-theme')).toBeVisible();
    await expect(page.getByTestId('palette-row-nav-map')).toHaveCount(0);

    // Enter runs it: theme flips, palette closes.
    const themeBefore = (await page.locator('html').getAttribute('data-theme')) ?? 'dark';
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', themeBefore);
    await expect(palette).toHaveCount(0);

    // Re-open, Esc closes without running anything.
    await pressPaletteKey(page);
    await expect(palette).toBeVisible();
    const themeMid = (await page.locator('html').getAttribute('data-theme')) ?? 'dark';
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', themeMid);

    // Keyboard nav: ArrowDown moves the highlight, Enter runs (nav to Feed).
    await pressPaletteKey(page);
    // Recents law: the last-run command (theme) sits first, highlighted.
    await expect(page.getByTestId('palette-row-toggle-theme')).toHaveClass(/is-highlighted/);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('palette-row-nav-map')).toHaveClass(/is-highlighted/);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('palette-row-nav-feed')).toHaveClass(/is-highlighted/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();
    await expect(palette).toHaveCount(0);

    // Recents round-trip: nav-feed ran this session -> appears under Recent.
    await pressPaletteKey(page);
    await expect(page.getByTestId('palette-row-nav-feed')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.screenshot({ path: path.join(SHOT_DIR, `palette-${testInfo.project.name}.png`) });
    expect(errors).toEqual([]);
  });

  test('scrim click closes; chip opens (desktop/tablet)', async ({ page }, testInfo) => {
    const errors = await setup(page);
    const palette = page.getByTestId('palette');

    if (testInfo.project.name === 'phone') {
      // Owner law: controls clickable on first try — phone gets the drawer
      // item; the header chip is CSS-hidden below 480px.
      await expect(page.getByTestId('palette-chip')).toBeHidden();
      await tapOrClick(page, page.getByTestId('nav-menu-button'));
      await tapOrClick(page, page.locator('[data-drawer-item="palette"]'));
      await expect(palette).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette).toHaveCount(0);
    } else {
      // Discoverability: visible ⌘K chip >=44px, click opens.
      const chip = page.getByTestId('palette-chip');
      await expect(chip).toBeVisible();
      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await tapOrClick(page, chip);
      await expect(palette).toBeVisible();
    }

    // Scrim click (outside the dialog) closes; dialog click does not.
    await page.mouse.click(10, 10);
    await expect(palette).toHaveCount(0);
    // Dialog click stays open (click-scrim law).
    await pressPaletteKey(page);
    await expect(palette).toBeVisible();
    const dialogBox = await page.getByTestId('palette-dialog').boundingBox();
    expect(dialogBox).not.toBeNull();
    await page.mouse.click(dialogBox!.x + dialogBox!.width / 2, dialogBox!.y + 10);
    await expect(palette).toBeVisible();

    // Town typeahead: run 'Go to town…' -> gazetteer list -> pick -> town page.
    await page.getByTestId('palette-input').fill('go to town');
    // 'Go to Map/Feed/Alerts' also prefix-match; 'Go to town…' is last, so
    // ArrowUp wraps to it.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('palette-mode-note')).toBeVisible();
    const townRows = page.locator('[data-testid^="palette-town-"]');
    await expect(townRows.first()).toBeVisible();
    await page.getByTestId('palette-input').fill('springfield');
    const filtered = page.locator('[data-testid^="palette-town-"]');
    const n = await filtered.count();
    expect(n).toBeGreaterThan(0);
    await tapOrClick(page, filtered.first());
    await expect(page.getByTestId('town-page')).toBeVisible();
    await expect(page.getByTestId('palette')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
