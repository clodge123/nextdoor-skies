// W3-B1 ROUTING Gate 1 — real Chromium, production build served by
// scripts/e2e-serve.mjs. Asserts deep-link HARD loads (no client-side nav)
// of /, /feed, /t/<real-slug>/feed, and the gazetteer-validated 404 page,
// plus popstate back-button behavior. Console-clean collector per the L2
// harness law. Run ONLY via scripts/e2e-gate.sh (fleet browser law).
import { expect, test, type Page, type Route } from '@playwright/test'
import { markTourSeen } from './tour-seed';

const SPRINGFIELD = 'springfield-37.22--93.3'

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  // Documented exclusions (same law as map.spec.ts): GL-driver perf chatter
  // and maplibre style-spec validation warnings from the THIRD-PARTY
  // OpenFreeMap style. App-origin console output must be empty.
  const IGNORED = /GL Driver Message|Expected value to be of type .*null/
  page.on('console', (msg) => {
    if (IGNORED.test(msg.text())) return
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

/** Zero real network: weather proxy + alerts poll answer deterministically. */
function stubWeatherAndAlerts(page: Page): void {
  void page.route(/\/api\/weather\?.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps: {}, stale: false }) })
  })
  void page.route(/\/api\/alerts\?.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [], stale: false }) })
  })
}

/** Town-feed posts fixture for the Springfield slug; other towns -> empty. */
function stubPostsApi(page: Page): void {
  void page.route('**/api/posts?**', async (route) => {
    const url = new URL(route.request().url())
    const town = url.searchParams.get('town')
    const posts =
      town === SPRINGFIELD
        ? [
            {
              id: 'p_route',
              author: 'maria',
              town: SPRINGFIELD,
              text: 'deep link works',
              snapshot: null,
              createdAt: '2026-10-21T10:00:00.000Z',
              reactions: { '👍': 1, '❤️': 0, '😂': 0 },
              myReaction: null,
              commentsCount: 0,
              hot: true,
            },
          ]
        : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts }) })
  })
}

async function relayOfm(route: Route) {
  // Same node-side tile relay as map.spec.ts (host egress proxy strips CORS
  // for direct browser fetches); failures stay route-level, never app console.
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(route.request().url())
      if (!res.ok) throw new Error(`upstream ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await route.fulfill({
        status: 200,
        body: buf,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        },
      })
      return
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
    }
  }
  await route.fulfill({ status: 502, body: String(lastErr) })
}

test('deep-link hard load of / renders the map with Map nav active', async ({ page }) => {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeatherAndAlerts(page)

  await markTourSeen(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Map', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})

test('deep-link hard load of /feed renders the feed gate with Feed nav active', async ({ page }) => {
  const errors = attachConsoleCollector(page)
  stubWeatherAndAlerts(page)

  await markTourSeen(page);
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('feed-page')).toBeVisible()
  await expect(page.getByTestId('identity-picker')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Feed', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})

test('deep-link hard load of /t/<real-slug>/feed seeds THAT town, not the session', async ({ page }) => {
  const errors = attachConsoleCollector(page)
  stubWeatherAndAlerts(page)
  stubPostsApi(page)

  await markTourSeen(page);
  await page.goto(`/t/${SPRINGFIELD}/feed`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('feed-page')).toBeVisible()
  await expect(page.getByTestId('feed-town')).toHaveText('Springfield')
  await expect(page.getByTestId('post-p_route')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Feed', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})

test('unknown town slug hard-loads the honest 404 page with search', async ({ page }) => {
  const errors = attachConsoleCollector(page)
  stubWeatherAndAlerts(page)

  await markTourSeen(page);
  await page.goto('/t/no-such-town-0.0-0.0', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('not-found-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: /404/ })).toBeVisible()
  await expect(page.getByTestId('not-found-slug')).toHaveText(/no-such-town-0\.0-0\.0/)
  await expect(page.getByTestId('not-found-search')).toBeVisible()
  expect(errors).toEqual([])
})

test('back button (popstate) returns from /feed to the map', async ({ page }) => {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeatherAndAlerts(page)

  await markTourSeen(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('link', { name: 'Feed', exact: true }).click()
  await expect(page).toHaveURL(/\/feed$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/$|(\?|#)$/)
  await expect(page.getByTestId('map-view')).toBeVisible({ timeout: 30_000 })
  expect(errors).toEqual([])
})
