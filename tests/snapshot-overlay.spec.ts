// W4-BF TEXT-ONLY COMPOSER GATE (owner round #2: "take the images out") —
// REAL_API=1 gated Playwright spec. Exercises the FULL user-post flow
// through scripts/api-serve.mjs (real api/posts.js, zero mocked routes —
// C6 law): composer is text + town chip only -> POST /api/posts ships
// text-only (no snapshot fields) -> feed renders the text card with
// author + timestamp (C-03 geometry). The snapshot capture UI is GONE:
// no CAPTURE button, no preview, no image in the card, no lightbox.
//
// Run: REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/snapshot-overlay.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { markTourSeen } from './tour-seed';

const TOWN_SLUG = 'springfield-37.22--93.3';
const SESSION = JSON.stringify({ nickname: 'jordan', townSlug: TOWN_SLUG, townName: 'Springfield' });

async function seedSession(page: Page) {
  await page.addInitScript(
    ([key, value]: string[]) => localStorage.setItem(key, value),
    ['nds-session', SESSION],
  );
  await markTourSeen(page);
}

test.describe('text-only composer (real api)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run');

  test('composer has NO capture UI — text-only post lands in feed', async ({ page }) => {
    await seedSession(page);
    await page.goto('/feed', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('feed-composer')).toBeVisible();
    await expect(page.getByTestId('composer-town-chip')).toContainText('Springfield');

    // W4-BF: the snapshot capture surface is removed.
    await expect(page.getByTestId('composer-capture')).toHaveCount(0);
    await expect(page.getByTestId('composer-preview-img')).toHaveCount(0);

    await page.getByTestId('composer-text').fill('w4-bf gate: text-only post');
    const [postRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/posts') && r.request().method() === 'POST'),
      page.getByTestId('composer-send').click(),
    ]);
    expect(postRes.status()).toBe(201);
    const row = (await postRes.json()).post;
    expect(row.snapshot).toBeNull();
    expect(row.snapshotId).toBeNull();

    // Feed renders the text card — author + stamp chrome, NO image.
    const card = page.getByTestId(`post-${row.id}`);
    await expect(card).toBeVisible();
    await expect(card.getByText('w4-bf gate: text-only post')).toBeVisible();
    await expect(card.getByTestId(`meta-${row.id}`)).toContainText('jordan');
    await expect(card.locator('img')).toHaveCount(0);
  });
});
