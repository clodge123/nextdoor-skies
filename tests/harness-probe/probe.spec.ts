import { test, expect } from '../e2e/fixtures';

/**
 * Harness probe (L2 selftest) — NOT part of the main suite.
 * scripts/e2e-selftest.mjs runs this in its own Playwright process and
 * asserts the run FAILS: a page logging console.error must be caught by the
 * console-error collector fixture. Proves the gate foundation gates.
 */
test('probe: console error must fail', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => console.error('harness-selftest: deliberate boom'));
});
