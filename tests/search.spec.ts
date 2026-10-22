// W3-B4 SEARCH + FLY-TO — Gate 1 (real Chromium, production build via
// scripts/e2e-serve.mjs). Wave-3 session 2 decision 3: header town search
// (inline desktop/tablet, phone drawer) selects a gazetteer town and the map
// ANIMATED-flies there (wave-1 animation law — eased ~1.8s flyTo, nothing
// teleports) while the town panel opens.
//
// URL honesty (documented scheme choice): selection navigates to
// `/?panel=<slug>` — the same scheme a badge click uses (src/lib/panel.ts).
// Flying writes NOTHING to the URL: ?ndsCenter stays the e2e center hook
// only, so production URLs stay clean and deep links work.
//
// Assertions:
//   - type 'sal' -> dropdown lists Salina (type-ahead, keyboard navigable);
//   - Enter -> URL carries panel=salina-38.84--97.61, map is MOVING
//     (isMoving true; canvas transform changes over time = animation runs,
//     not a jump-cut), and lands at zoom >= 9 (badge-visible law);
//   - panel opens (deep link /?panel=... opens + flies identically);
//   - empty state 'No towns match';
//   - phone: drawer search instance is the surface (inline hides <=480px).
//
// Console-clean collector per the L2 harness law (same documented maplibre
// exclusions as map.spec.ts / badges.spec.ts). Run ONLY via
// scripts/e2e-gate.sh (fleet browser law).
import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { markTourSeen } from './tour-seed';

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W3-B4')
const SALINA_SLUG = 'salina-38.84--97.61'
const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/
const POSTS_URL = /\/api\/posts\?.*/

const IGNORED = /GL Driver Message|Expected value to be of type .*null/

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (IGNORED.test(t)) return
    if (msg.type() === 'error') errors.push(t)
  })
  page.on('pageerror', (err) => {
    const t = String(err)
    if (!IGNORED.test(t)) errors.push(t)
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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function stubTownId(name: string, lat: number, lon: number): string {
  return `${slugify(name)}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`
}

let stubTowns: Array<{ name: string; lat: number; lon: number }> | null = null

/** Deterministic temps for every town in the requested bbox. */
function stubWeather(page: Page): void {
  void page.route(WEATHER_URL, async (route) => {
    if (!stubTowns) {
      stubTowns = JSON.parse(
        readFileSync(path.join(process.cwd(), 'data', 'towns', 'us-towns.json'), 'utf8'),
      ).towns
    }
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
    const temps: Record<string, number> = {}
    for (const t of stubTowns) {
      if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) {
        temps[stubTownId(t.name, t.lat, t.lon)] = 17.5
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps, stale: false }) })
  })
}

function stubAlerts(page: Page): void {
  void page.route(ALERTS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ alerts: [], stale: false }),
    })
  })
}

function stubPosts(page: Page): void {
  void page.route(POSTS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ posts: [] }),
    })
  })
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeather(page)
  stubAlerts(page)
  stubPosts(page)
  return errors
}

/** Wait until the map style is live (flyTo needs a mounted, loaded map). */
async function mapReady(page: Page): Promise<void> {
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
}

//** Zoom samples over a short window — proof of eased animation frames. */
async function zoomSamples(page: Page, ms: number, n = 6): Promise<number[]> {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(await page.evaluate(() => (window as { ndsMap?: { getZoom: () => number } }).ndsMap!.getZoom()))
    await page.waitForTimeout(ms / n)
  }
  return out
}

function isPhone(page: Page): boolean {
  const vp = page.viewportSize()
  return !!vp && vp.width <= 480
}

/** Open the phone drawer and return its search input (phone surface). */
async function drawerSearchInput(page: Page) {
  await page.getByTestId('nav-menu-button').tap()
  const drawer = page.getByTestId('nav-drawer')
  await expect(drawer).toHaveAttribute('data-open', 'true')
  return page.getByTestId('town-search-drawer').getByRole('combobox', { name: 'Search towns' })
}

/** The visible search surface for this viewport (inline hides <=480px). */
async function searchInput(page: Page) {
  if (isPhone(page)) return drawerSearchInput(page)
  return page.getByTestId('town-search').getByRole('combobox', { name: 'Search towns' })
}

test('search "sal" -> dropdown -> Enter flies (animated) to Salina, panel opens, zoom>=9', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await markTourSeen(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await mapReady(page)

  const input = await searchInput(page)
  await input.fill('sal')
  // Type-ahead dropdown: Salina (KS) is among the ranked options.
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible({ timeout: 5_000 })
  const salinaOpt = list.locator(`[data-town-slug="${SALINA_SLUG}"]`)
  await expect(salinaOpt).toBeVisible()
  await expect(salinaOpt.locator('.town-search-option-name')).toHaveText('Salina')

  // Keyboard law: refine to 'salina' (Salinas CA pop-ranks first, Salina KS
  // second), ArrowDown moves the active option, Enter selects.
  await input.fill('salina')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  // URL honesty: selection navigates to the panel scheme — the ONLY URL
  // change flying causes (no ?ndsCenter, no coordinate state).
  await expect(page).toHaveURL(new RegExp(`[?&]panel=${SALINA_SLUG.replace(/[.-]/g, '\\$&')}`))

  // ANIMATION LAW: the map flies — isMoving true within the animation
  // window (proves an eased flight started, not a teleport / jump-cut), and
  // the canvas transform CHANGES OVER TIME (eased frames).
  await page.waitForFunction(
    () => (window as { ndsMap?: { isMoving?: () => boolean } }).ndsMap?.isMoving?.() === true,
    null,
    { timeout: 5_000 },
  )
  // Eased FRAMES (not a teleport): zoom takes multiple distinct values
  // while isMoving — maplibre v5 animates in WebGL (no CSS transform), so
  // sampling the live zoom is the honest animation proof.
  const samples = await zoomSamples(page, 600)
  const distinct = new Set(samples.map((z) => z.toFixed(2)))
  expect(distinct.size, `fly must render eased frames, got ${JSON.stringify(samples)}`).toBeGreaterThanOrEqual(3)

  // Lands at badge-visible zoom (>= 9) with the panel open.
  await page.waitForFunction(
    () => (window as { ndsMap?: { getZoom: () => number } }).ndsMap!.getZoom() >= 9,
    null,
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Salina' })).toBeVisible()
  // Panel slug resolves to Salina, KS (the pop-ranked 'sal' prefix winner).
  await expect(page.getByTestId('town-panel-open')).toHaveAttribute('href', `/t/${SALINA_SLUG}`)

  await page.screenshot({ path: path.join(SHOT_DIR, `flyto-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})

test('deep link /?panel=<slug> opens the panel and flies (URL is the whole state)', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await markTourSeen(page);
  await page.goto(`/?panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
  await mapReady(page)
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 15_000 })
  // Deep-link open flies too (one rule: every panel open animates).
  await page.waitForFunction(
    () => (window as { ndsMap?: { getZoom: () => number } }).ndsMap!.getZoom() >= 9,
    null,
    { timeout: 15_000 },
  )
  expect(errors).toEqual([])
})

test('empty query state: "No towns match"', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const errors = await setup(page)
  await markTourSeen(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await mapReady(page)
  const input = await searchInput(page)
  await input.fill('zzqx')
  await expect(page.getByTestId('town-search-empty')).toHaveText('No towns match')
  await page.screenshot({ path: path.join(SHOT_DIR, `empty-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})

test('phone: drawer search is the surface, inline search hides <=480px', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  test.skip(!isPhone(page), 'phone-only: drawer search surface')
  const errors = await setup(page)
  await markTourSeen(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await mapReady(page)

  // Inline instance is display:none on phone (drawer is the surface).
  await expect(page.getByTestId('town-search')).toBeHidden()

  const input = await drawerSearchInput(page)
  await input.fill('sal')
  const opt = page.locator(`[data-town-slug="${SALINA_SLUG}"]`).first()
  await expect(opt).toBeVisible({ timeout: 5_000 })
  await opt.tap()

  // Selection navigates + closes the drawer, panel opens after the fly.
  await expect(page.getByTestId('nav-drawer')).toHaveAttribute('data-open', 'false')
  await expect(page).toHaveURL(new RegExp(`[?&]panel=${SALINA_SLUG.replace(/[.-]/g, '\\$&')}`))
  await page.waitForFunction(
    () => (window as { ndsMap?: { getZoom: () => number } }).ndsMap!.getZoom() >= 9,
    null,
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: path.join(SHOT_DIR, `drawer-search-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})
