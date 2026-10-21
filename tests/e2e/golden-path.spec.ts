import { expect, test, archiveScreenshot } from './fixtures';

/**
 * Golden-path skeleton (L2 Gate 1 foundation).
 * Load / → assert heading → click nav → assert /feed renders.
 * Runs in phone, tablet, and desktop projects. Zero console errors enforced
 * by the console-error collector fixture.
 *
 * L12 note: the main port now serves the REAL app (root vite project) so
 * map/badges specs can drive '/' directly. This lane's harness content (the
 * fixtures stand-in with the 'NextDoor Skies' h1) is served by
 * scripts/e2e-serve.mjs on port+1, which is what this spec targets.
 */

const PORT = Number(process.env.E2E_PORT ?? 43117);
const FIXTURES_URL = `http://127.0.0.1:${PORT + 1}`;

test.describe('golden path', () => {
  test('loads home, asserts heading, navigates to feed', async ({ page, consoleBundle }, testInfo) => {
    void consoleBundle; // console-error collector active for the whole test

    await page.goto(`${FIXTURES_URL}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('NextDoor Skies');
    await archiveScreenshot(page, testInfo, 'home');

    await page.getByRole('link', { name: 'Feed' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Feed');
    await expect(page).toHaveURL(/\/feed$/);
    await archiveScreenshot(page, testInfo, 'feed');
  });

  test('nav highlights active route', async ({ page }) => {
    await page.goto(`${FIXTURES_URL}/`);
    await expect(page.locator('nav a[data-route="/"]')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Feed' }).click();
    await expect(page.locator('nav a[data-route="/feed"]')).toHaveAttribute('aria-current', 'page');
  });
});
