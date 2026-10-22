import { expect, test, archiveScreenshot } from './fixtures';
import { markTourSeen } from '../tour-seed';

/**
 * Golden-path skeleton (L2 Gate 1 foundation).
 * Load / → assert heading → click nav → assert /feed renders.
 * Runs in phone, tablet, and desktop projects. Zero console errors enforced
 * by the console-error collector fixture.
 *
 * Wave-3 closeout note: this spec used to target the L2 fixtures stand-in on
 * port+1 (the "NextDoor Skies" h1 harness page). In REAL_API=1 mode the
 * webServer is api-serve and no fixtures preview exists — the golden path is
 * a product journey, so it now drives the REAL app via baseURL in BOTH modes
 * (plain e2e-serve serves the real app on the main port; REAL_API serves app
 * + real API handlers). The app's own surfaces satisfy every assertion:
 * h1#map-heading "Map", h1#feed-heading "Feed", nav links with data-route +
 * computed aria-current. First-visit tour is seeded away (returning-visitor
 * model, tests/tour-seed.ts) so the scrim never hijacks these clicks.
 */

test.describe('golden path', () => {
  test('loads home, asserts heading, navigates to feed', async ({ page, consoleBundle }, testInfo) => {
    void consoleBundle; // console-error collector active for the whole test

    await markTourSeen(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Map');
    await archiveScreenshot(page, testInfo, 'home');

    await page.getByRole('link', { name: 'Feed' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Feed');
    await expect(page).toHaveURL(/\/feed$/);
    await archiveScreenshot(page, testInfo, 'feed');
  });

  test('nav highlights active route', async ({ page }) => {
    await markTourSeen(page);
    await page.goto('/');
    await expect(page.locator('nav a[data-route="/"]')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Feed' }).click();
    await expect(page.locator('nav a[data-route="/feed"]')).toHaveAttribute('aria-current', 'page');
  });
});
