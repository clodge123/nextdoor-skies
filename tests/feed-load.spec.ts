// W4-C2 FEED-LOAD Gate — real Chromium against the REAL api handlers
// (scripts/api-serve.mjs, REAL_API=1), zero mocked routes. Fleet law: run
// ONLY through scripts/e2e-gate.sh, ONE gated run.
//
// Acceptance (docs/WAVE-4-BRAINSTORM.md S2 laws 3+4, lane brief):
//   1. Infinite scroll: the feed serves page 1 (30 rows); scrolling near
//      the sentinel appends page 2 — NO duplicate rows, keys stable.
//   2. Honest end-of-list: the last (short) page renders "You're all
//      caught up" — never fake rows, sentinel gone.
//   3. content-visibility: auto + contain-intrinsic-size on feed rows
//      (off-screen rows skip paint).
//   4. Prefetch fires on badge hover: hovering a town badge issues a
//      posts request on the ISOLATED `prefetch:posts:*` key (network log +
//      window.__ndsPrefetchKeys seam) — user keys untouched.
//
// Seeding law: posts are created through the REAL POST /api/posts route
// (session header, contract shape) — no mocked fixtures, no fake rows.
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { markTourSeen } from './tour-seed'

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W4-C2')
const API_PORT = Number(process.env.E2E_API_PORT ?? 43118)
const API = `http://127.0.0.1:${API_PORT}`
const TOWN_SLUG = 'springfield-37.22--93.3'
const SALINA_SLUG = 'salina-38.84--97.61'
const SESSION = JSON.stringify({
  nickname: 'jordan',
  townSlug: TOWN_SLUG,
  townName: 'Springfield',
})
const PAGE_SIZE = 30 // api/posts.js PAGE_SIZE (contract mirror)
const TOTAL = PAGE_SIZE + 5 // 35 rows -> page 1 full, page 2 short (end)
const MAPLIBRE_NOISE = /GL Driver Message|Expected value to be of type .*null/

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (MAPLIBRE_NOISE.test(t)) return
    if (msg.type() === 'error') errors.push(t)
  })
  page.on('pageerror', (err) => {
    const t = String(err)
    if (!MAPLIBRE_NOISE.test(t)) errors.push(t)
  })
  return errors
}

/** Seed n posts through the REAL POST route (oldest first -> p1..pn; the
 *  server stamps createdAt, so the newest-first list is pn..p1 — exact,
 *  deterministic ids for assertions). */
async function seedPosts(page: Page, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    const res = await page.request.post(`${API}/api/posts`, {
      headers: { 'content-type': 'application/json', 'x-nds-session': SESSION },
      data: { town: TOWN_SLUG, text: `w4-c2 scroll seed ${String(i).padStart(3, '0')}` },
    })
    expect(res.status()).toBe(201)
  }
}

/** Row ids currently rendered, in DOM order. */
async function rowIds(page: Page): Promise<string[]> {
  return page.$$eval('[data-testid^="post-"]', (els) =>
    els.map((el) => el.getAttribute('data-post-id') ?? ''),
  )
}

test.describe('W4-C2 feed load (real API)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run')

  test('infinite scroll: page 2 appends on scroll, no dupes, honest end marker', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const errors = attachConsoleCollector(page)
    await markTourSeen(page)

    await seedPosts(page, TOTAL)

    // Session + Latest tab (global stream, newest-first across towns).
    await page.addInitScript((s) => localStorage.setItem('nds-session', s), SESSION)
    const postsRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/posts?') && req.method() === 'GET') postsRequests.push(req.url())
    })

    await page.goto('/feed?scope=latest', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-page')).toBeVisible({ timeout: 30_000 })

    // Page 1 = exactly PAGE_SIZE rows, newest-first.
    await expect(page.locator('[data-testid^="post-"]')).toHaveCount(PAGE_SIZE, { timeout: 30_000 })
    const page1 = await rowIds(page)
    expect(page1).toHaveLength(PAGE_SIZE)
    expect(new Set(page1).size).toBe(PAGE_SIZE)
    // More rows exist: sentinel present, NO end marker yet.
    await expect(page.getByTestId('feed-sentinel')).toBeAttached()
    await expect(page.getByTestId('feed-end-marker')).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOT_DIR, `page1-${testInfo.project.name}.png`) })

    // content-visibility law (session 2 law 4): rows skip paint off-screen.
    const card = page.locator('.feed-card').first()
    await expect(card).toHaveCSS('content-visibility', 'auto')
    await expect(card).toHaveCSS('contain-intrinsic-size', /auto \d+px/)

    // Scroll near the sentinel -> append page 2 (the 5-row tail).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(page.locator('[data-testid^="post-"]')).toHaveCount(TOTAL, { timeout: 30_000 })

    // No duplicate rows — ever (keys stable, ids unique across pages).
    const all = await rowIds(page)
    expect(all).toHaveLength(TOTAL)
    expect(new Set(all).size).toBe(TOTAL)

    // Honest end-of-list: short page -> marker, sentinel gone, zero fake rows.
    await expect(page.getByTestId('feed-end-marker')).toContainText("You're all caught up")
    await expect(page.getByTestId('feed-sentinel')).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOT_DIR, `page2-end-${testInfo.project.name}.png`) })

    // The append rode an explicit page= request (server-side paging).
    expect(postsRequests.some((u) => u.includes('page=2'))).toBe(true)
    expect(errors).toEqual([])
  })

  test('prefetch fires on badge hover (isolated prefetch key, network log)', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const errors = attachConsoleCollector(page)
    // Deterministic weather/alerts stubs (badges.spec law) — the zoom-9
    // viewports fire the shared refreshers; stubbing keeps the gate fast.
    const WEATHER_URL = /\/api\/weather\?.*/
    const ALERTS_URL = /\/api\/alerts\?.*/
    await page.route(WEATHER_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps: {}, stale: false }) }),
    )
    await page.route(ALERTS_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [], stale: false }) }),
    )
    await page.route('**tiles.openfreemap.org/**', async (route) => {
      try {
        const res = await fetch(route.request().url())
        const buf = Buffer.from(await res.arrayBuffer())
        await route.fulfill({
          status: 200,
          body: buf,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
          },
        })
      } catch {
        await route.fulfill({ status: 502, body: 'relay failed' })
      }
    })
    await markTourSeen(page)

    const postsRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/posts?')) postsRequests.push(req.url())
    })

    // Salina-centered zoom-9 view (badges visible = labels visible).
    await page.goto(`/?ndsCenter=-97.6114,38.8403`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
    await page.waitForFunction(
      () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
      null,
      { timeout: 45_000 },
    )
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'zoom in' }).click()
    }
    const badge = page.getByTestId(`town-badge-${SALINA_SLUG}`)
    await expect(badge).toBeVisible({ timeout: 20_000 })

    // Hover = attention = prefetch (ring law -> posts).
    await badge.hover()
    await expect
      .poll(() => postsRequests.filter((u) => u.includes(`town=${SALINA_SLUG}`)).length, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1)

    // The request rode the ISOLATED prefetch key (never a user key). The
    // LRU seam survives completion (in-flight keys are transient).
    const lru = await page.evaluate(() => (window as { __ndsPrefetchTowns?: () => string[] }).__ndsPrefetchTowns?.() ?? [])
    expect(lru.some((k) => k.startsWith('prefetch:posts:'))).toBe(true)
    const netKeys = await page.evaluate(() => (window as { __ndsNetKeys?: () => string[] }).__ndsNetKeys?.() ?? [])
    expect(netKeys.filter((k) => k.startsWith('posts:')).length).toBe(0) // no user-key storm
    await page.screenshot({ path: path.join(SHOT_DIR, `prefetch-hover-${testInfo.project.name}.png`) })
    expect(errors).toEqual([])
  })
})
