// W4-C1 FETCH-HYGIENE Gate 1 (wave-4 session 2 laws 1–2) — real Chromium
// against the REAL api handlers (scripts/api-serve.mjs, REAL_API=1), zero
// mocked routes. The slow-server seam is api-serve's `__delay` query-param
// override (GET /api/posts only) — the app never sends it; the spec rewrites
// request URLs to add it, proving skeleton -> content and timeout -> honest
// error+retry against the real endpoint.
//
// Run ONE gated run (fleet browser law):
//   REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/loading.spec.ts --project=desktop
//
// W4-G1 MATRIX NOTE (honest, no stubs): session-6 law 3 also lists
// "infinite scroll appends page 2" + "content-visibility rows skip paint".
// Those are lane W4-C2 (feed-load) features and C2 is RUNNING on its own
// branch at this writing — the app tree here has no `page=` pagination, no
// IntersectionObserver sentinel, and no `content-visibility` rule (verified
// by grep). Asserting them now would require stubbing the feature, which the
// wave law forbids; they land as additional cases when C2 merges. The three
// C1-hygiene cases below are complete and green.
//
// Console-clean collector per the L2 harness law (maplibre exclusions as in
// map.spec.ts / town-panel.spec.ts).
import { expect, test, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { markTourSeen } from './tour-seed';

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W4-C1')
const SALINA_SLUG = 'salina-38.84--97.61'
const SALINA_CENTER = '-97.6114,38.8403'
const POSTS_URL = /\/api\/posts\?.*/
const MAPLIBRE_NOISE = /GL Driver Message|Expected value to be of type .*null/

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (MAPLIBRE_NOISE.test(t)) return
    if (msg.type() === 'error') {
      // Documented law (badge-label-bbox.spec.ts / smoke-prod family):
      // relayed tile-pyramid failures are WARNINGS — the node relay 502s
      // only after its own retries; app-origin console output stays empty.
      const url = msg.location()?.url ?? ''
      if (/Failed to load resource/.test(t) && url.includes('openfreemap.org')) return
      errors.push(t)
    }
  })
  page.on('pageerror', (err) => {
    const t = String(err)
    if (!MAPLIBRE_NOISE.test(t)) errors.push(t)
  })
  return errors
}

/** Node-side tile relay (host egress proxy strips CORS), map.spec.ts law. */
async function relayOfm(route: Route) {
  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
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

/**
 * Slow-server seam: rewrite every GET /api/posts request to carry
 * `__delay=<ms>` (api-serve sleeps that long before answering the REAL
 * handler). Returns a setter so each phase controls the delay live.
 */
async function slowPosts(page: Page, ms: () => number): Promise<void> {
  await page.route(POSTS_URL, async (route) => {
    const url = new URL(route.request().url())
    const d = ms()
    if (d > 0) url.searchParams.set('__delay', String(d))
    await route.continue({ url: url.toString() })
  })
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await markTourSeen(page);
  return errors
}

async function mapReady(page: Page): Promise<void> {
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
}

test.describe('W4-C1 loading experience (real API, slow-server fixture)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run')

  test('slow server: skeleton shimmer -> content (never static "awaiting feed")', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const errors = await setup(page)
    let delay = 2500
    await slowPosts(page, () => delay)

    await page.goto(`/?panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
    // NO mapReady gate: the panel is a mount-time overlay (deep link opens
    // it on React mount, style-load not required). Gating on the map style
    // burned the 2.5s fetch window before the skeleton check ran.

    // Panel is open; posts are in flight (2.5s) => shimmer skeletons, and
    // the OLD static "Loading posts…" text is GONE (session 2 law 1).
    await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('town-panel-skeleton')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('town-panel-posts')).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOT_DIR, `skeleton-${testInfo.project.name}.png`) })

    // Content arrives (real handler answer) and replaces the skeletons.
    delay = 0
    await expect(page.getByTestId('town-panel-skeleton')).toHaveCount(0)
    await expect(page.getByTestId('town-panel-posts-empty')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: path.join(SHOT_DIR, `content-${testInfo.project.name}.png`) })
    expect(errors).toEqual([])
  })

  test('timeout: skeleton -> honest "Feed unavailable — Salina" + Try again', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const errors = await setup(page)
    // 18s >> the 10s netFetch timeout: on THIS loaded host setTimeout lags
    // (probe trace: the 10s abort timer fired +3.2s late), and an 13s delay
    // raced that lag — attempt 2's response landed just before the late
    // abort and rendered "No posts". 18s guarantees both attempts die to
    // timeout: attempt 1 aborts ~10s+lag, 300ms backoff, attempt 2 aborts
    // ~10s+lag -> honest error card (~21s + lag).
    await slowPosts(page, () => 18_000)

    await page.goto(`/?panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
    // No mapReady gate (panel opens on mount); keeps the 11s timeout clock
    // deterministic from navigation, not from style-load latency.
    await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('town-panel-skeleton')).toBeVisible({ timeout: 5_000 })

    const err = page.getByTestId('town-panel-posts-error')
    await expect(err).toContainText('Feed unavailable — Salina', { timeout: 35_000 })
    await expect(page.getByTestId('town-panel-posts-retry')).toBeVisible()
    await page.screenshot({ path: path.join(SHOT_DIR, `error-${testInfo.project.name}.png`) })

    // Try again re-issues the request (no silent fallback, law 3).
    const retryReq = page.waitForRequest((r) => r.url().includes('/api/posts') && r.url().includes(SALINA_SLUG))
    await page.getByTestId('town-panel-posts-retry').click()
    await retryReq
    expect(errors).toEqual([])
  })

  test('fast pan: opening town B ABORTS the in-flight town A request (Google Maps rule)', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const errors = await setup(page)
    // Long delay (8s): both panel fetches must stay IN FLIGHT across the
    // fast pan, so the Salina request is genuinely superseded (abort), not
    // long-since settled.
    let delay = 8000
    await slowPosts(page, () => delay)

    const aborted: string[] = []
    page.on('requestfailed', (req) => {
      if (req.url().includes('/api/posts') && req.failure()?.errorText === 'net::ERR_ABORTED') {
        aborted.push(req.url())
      }
    })

    await page.goto(`/?ndsCenter=${SALINA_CENTER}`, { waitUntil: 'domcontentloaded' })
    await mapReady(page)

    // Open Salina via search (SPA navigation — the panel fetch starts).
    const input = page.getByTestId('town-search').getByRole('combobox', { name: 'Search towns' })
    await input.fill('salina')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('town-panel-skeleton')).toBeVisible({ timeout: 15_000 })

    // Fast pan: jump straight to Jeffersonville while Salina is in flight.
    await input.fill('jefferson')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 15_000 })

    // The stale Salina request was ABORTED (never lands), and EXACTLY ONE
    // key ('panel-posts') is in flight — the newest request owns the key
    // (Google Maps rule: an old request can never block a new one).
    await expect
      .poll(() => aborted.filter((u) => u.includes(`town=${encodeURIComponent(SALINA_SLUG)}`)).length, {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1)
    const keys = await page.evaluate(() => (window as { __ndsNetKeys?: () => string[] }).__ndsNetKeys?.() ?? [])
    expect(keys.filter((k) => k === 'panel-posts').length).toBeLessThanOrEqual(1)
    expect(keys.filter((k) => k.includes(SALINA_SLUG)).length).toBe(0)
    await page.screenshot({ path: path.join(SHOT_DIR, `pan-abort-${testInfo.project.name}.png`) })
    expect(errors).toEqual([])
  })
})
