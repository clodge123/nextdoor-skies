import { expect, test } from '@playwright/test';
import { buildSeedData } from '../server/lib/seed.js';
import { FEED_HTML } from './fixtures/feed-page.js';

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
