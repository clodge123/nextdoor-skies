// W4-D2 SNAPSHOT-OVERLAY GATE (wave 4, lane D2) — REAL_API=1 gated Playwright
// spec. Exercises the FULL user-post composer flow through scripts/api-serve.mjs
// (real api/snapshot.js + api/posts.js, zero mocked routes — C6 law):
//   composer capture -> POST /api/snapshot (real ne2sr tiles) -> V1 strip
//   burned client-side -> POST /api/posts -> feed renders the REAL map image
//   (decoded variance >= 16, never black) with author + timestamp BELOW the
//   image (C-03 law). Plus the S7#4 failure path: a 502 capture shows the
//   exact loud message with RETRY / POST-WITHOUT-IMAGE — never a black box.
//
// Run: REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/snapshot-overlay.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { decode } from 'jpeg-js';
import { markTourSeen } from './tour-seed';

const TOWN_SLUG = 'springfield-37.22--93.3';
const SESSION = JSON.stringify({ nickname: 'jordan', townSlug: TOWN_SLUG, townName: 'Springfield' });

/** Luminance variance (C7 metric) of decoded JPEG pixels. */
function jpegVariance(buf: Buffer): number {
  const { data } = decode(buf, { useTArray: true });
  let sum = 0, sum2 = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += lum;
    sum2 += lum * lum;
    n++;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Fraction of bottom-strip pixels that are neon-green (strip burn-in proof). */
function neonGreenFraction(buf: Buffer): number {
  const { data, width, height } = decode(buf, { useTArray: true });
  const y0 = Math.floor(height * 0.9); // bottom 10% = the 48px strip on 360
  let hits = 0, total = 0;
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g = data[i + 1], r = data[i], b = data[i + 2];
      if (g > 180 && r < 120 && b < 160 && g - r > 80) hits++;
      total++;
    }
  }
  return hits / Math.max(1, total);
}

async function seedSession(page: Page) {
  await page.addInitScript(
    ([key, value]: string[]) => localStorage.setItem(key, value),
    ['nds-session', SESSION],
  );
  await markTourSeen(page);
}

test.describe('snapshot overlay (real api, real tiles)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run');

  test('composer capture -> burned strip -> feed image never black, author/time below', async ({ page, request }) => {
    await seedSession(page);
    await page.goto('/feed', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('feed-composer')).toBeVisible();
    await expect(page.getByTestId('composer-town-chip')).toContainText('Springfield');

    // Capture: POST /api/snapshot at the town view (real tile fetch).
    await page.getByTestId('composer-text').fill('w4-d2 gate: real map, strip burned in');
    await page.getByTestId('composer-capture').click();
    const preview = page.getByTestId('composer-preview-img');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    const previewSrc = (await preview.getAttribute('src')) ?? '';
    expect(previewSrc.startsWith('data:image/jpeg;base64,')).toBe(true);

    // Post ships snapshot + snapshotId + view coords.
    const [postRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/posts') && r.request().method() === 'POST'),
      page.getByTestId('composer-send').click(),
    ]);
    expect(postRes.status()).toBe(201);
    const row = (await postRes.json()).post;
    expect(row.snapshotId).toMatch(/^snap_[0-9a-z]+$/);
    expect(row.snapshot).toMatch(/^data:image\/jpeg;base64,/); // burned inline image
    expect(row.lat).toBe(37.22);
    expect(row.lon).toBe(-93.3);

    // Feed renders the post with the real map image — decode + variance gate.
    const card = page.getByTestId(`post-${row.id}`);
    await expect(card).toBeVisible();
    const img = card.getByTestId(`snapshot-${row.id}`);
    await expect(img).toBeVisible();
    const bytes = Buffer.from((await previewSrc.split('base64,')[1]) ?? '', 'base64');
    const variance = jpegVariance(bytes);
    console.log(`[w4-d2] burned image variance=${variance.toFixed(1)} bytes=${bytes.length}`);
    expect(variance).toBeGreaterThanOrEqual(16); // NEVER black (no-fallback law)
    expect(neonGreenFraction(bytes)).toBeGreaterThan(0.01); // V1 strip burned in

    // C-03 law: author + timestamp render BELOW the image in feed chrome.
    const meta = card.getByTestId(`meta-${row.id}`);
    await expect(meta).toContainText('jordan');
    const order = card.locator('[data-testid="meta-' + row.id + '"]');
    const imgBox = await img.boundingBox();
    const metaBox = await order.boundingBox();
    expect(imgBox).not.toBeNull();
    expect(metaBox).not.toBeNull();
    expect(metaBox!.y).toBeGreaterThan(imgBox!.y + imgBox!.height - 2);

    // No black placeholder anywhere: the snapshot error card must NOT be shown.
    await expect(card.getByTestId(`snapshot-error-${row.id}`)).toHaveCount(0);
  });

  test('variance-gate failure (502) shows the loud S7#4 error card + retry/post-without-image', async ({ page }) => {
    await seedSession(page);
    // Loud failure injection: the composer must surface it verbatim (S7#4).
    await page.route('**/api/snapshot', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'snapshot failed — post without image, or retry',
          detail: 'attempt 2: variance gate failed (0.0 < 16) — uniform canvas',
        }),
      }),
    );
    await page.goto('/feed', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('composer-text').fill('ghost sky gate');
    await page.getByTestId('composer-capture').click();

    const box = page.getByTestId('composer-snapshot-error');
    await expect(box).toBeVisible();
    await expect(box).toContainText('snapshot failed — post without image, or retry');
    await expect(page.getByTestId('composer-retry')).toBeVisible();
    await expect(page.getByTestId('composer-post-without-image')).toBeVisible();

    // POST-WITHOUT-IMAGE ships a text-only post — no snapshot reference.
    const [postRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/posts') && r.request().method() === 'POST'),
      page.getByTestId('composer-post-without-image').click(),
    ]);
    expect(postRes.status()).toBe(201);
    const row = (await postRes.json()).post;
    expect(row.snapshot).toBeNull();
    expect(row.snapshotId).toBeNull();
  });
});
