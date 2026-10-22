import { test, expect, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * L6 Gate 1 browser test — L12 retarget: drives the REAL app (root vite
 * project served by scripts/e2e-serve.mjs at '/'), no E2E_TARGET=test-app
 * needed. The real MapView mounts MapPage with zoom buttons + the L6
 * TownBadges overlay fed by createWeatherRefresher (viewport-filtered towns).
 *
 * Open-Meteo is stubbed via route mock (no real network). Runs in all three
 * viewports (R13); mobile exercises tap.
 *
 * Console exclusions (documented honestly, same family as map.spec.ts):
 * - GL Driver Message: headless swiftshader/ANGLE perf chatter.
 * - "Expected value to be of type ... null": maplibre style-spec validation
 *   chatter while parsing THIRD-PARTY OpenFreeMap style expressions, never
 *   app-origin. App-origin console output must be empty.
 * Tile/style requests to tiles.openfreemap.org are relayed node-side (host
 * egress proxy strips CORS otherwise) exactly like map.spec.ts.
 */

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'L6')
// W1 wave-2: the app now GETs the same-origin /api/weather proxy (S5).
// The old api.open-meteo.com/v1/batch POST stub is retired — that endpoint
// never existed (the production bug this lane fixes).
const WEATHER_URL = /\/api\/weather\?.*/
// S6 wave-2 integration: the map page polls /api/alerts per window. Stub it
// deterministically (Salina gets one Severe alert) so the banner + badge dot
// assertions never depend on live NWS state.
const ALERTS_URL = /\/api\/alerts\?.*/
const SALINA_SLUG = 'salina-38.84--97.61'

// Mirror of api/weather.js slug/townId + gazetteer.townsInBbox: the stubbed
// proxy resolves towns inside the requested bbox and keys temps by the SAME
// slug ids the client computes (slug-name-lat-lon), so badges light up.
import { readFileSync } from 'node:fs'

const TOWNS_PATH = path.join(process.cwd(), 'data', 'towns', 'us-towns.json')
let stubTowns: Array<{ name: string; lat: number; lon: number }> | null = null

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function stubTownId(name: string, lat: number, lon: number): string {
  return `${slugify(name)}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`
}

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

async function relayOfm(route: Route) {
  const url = route.request().url()
  // L12: retry transient egress-proxy 502s (fixed backoff, no randomness),
  // same as map.spec.ts, so glyph/tile warnings never reach the console gate.
  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url)
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
  // Tile errors stay warnings (law #4): 502 the route, UI must not flip.
  await route.fulfill({ status: 502, body: String(lastErr) })
}

function stubOpenMeteo(page: Page): Promise<void> {
  return page.route(WEATHER_URL, async (route) => {
    if (!stubTowns) {
      stubTowns = (JSON.parse(readFileSync(TOWNS_PATH, 'utf8')) as { towns: typeof stubTowns }).towns!
    }
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
    // Deterministic F temps (no RNG): cycle a fixed ladder per town index.
    const ladder = [70.5, 66.4, 31.3, 55.0, -2.5, 88.9]
    const temps: Record<string, number> = {}
    let i = 0
    for (const t of stubTowns) {
      if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) {
        temps[stubTownId(t.name, t.lat, t.lon)] = ladder[i++ % ladder.length]
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps, stale: false }) })
  })
}

function stubAlerts(page: Page): Promise<void> {
  return page.route(ALERTS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [
          {
            id: 'urn:oid:stub-salina-flood',
            event: 'Flood Warning',
            town: SALINA_SLUG,
            severity: 'Severe',
            expires: null,
          },
        ],
        stale: false,
      }),
    })
  })
}

/** Tap on touch contexts, click elsewhere (R13: touch verified on mobile). */
async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap()
  else await locator.click()
}

async function setup(page: Page): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await stubOpenMeteo(page)
  await stubAlerts(page)
  // Center on Salina, KS: zoom-9 viewports are ~3.5deg wide and the default
  // center sits between baked towns, so badge temps would never resolve.
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' })
  // Real map mounted (canvas exists, style loaded).
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  return errors
}

test('badge shows temp number over a town when zoomed', async ({ page }, testInfo) => {
  // Style load + zoom-9 tile settling through the node relay can exceed the
  // 30s default on this host (same budget bump as map.spec.ts).
  test.setTimeout(120_000)
  const errors = await setup(page)

  // Zoomed out (initial zoom 3, below TOWN_BADGE_MIN_ZOOM=6): no badges.
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  // W3-A3 MAP TINT gate (session-1 decision 6): below zoom 9 there is
  // nothing to summarize, so the tint overlay must NOT exist in the DOM.
  await expect(page.getByTestId('map-tint')).toHaveCount(0)

  // TWO clicks of 'zoom in' (3 -> 6 -> 9) cross the wave-2 zoom-9 badge grade
  // (TOWN_BADGE_MIN_ZOOM=9 on main; MapView steps +3 per click).
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))

  // At least one badge visible, carrying a real ° number (stubbed temps).
  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await expect(badge.locator('.town-badge-temp')).toContainText(/-?\d+°/, { timeout: 10_000 })

  // Square geometry (R20): zero border-radius.
  await expect(badge).toHaveCSS('border-radius', '0px')

  // W3-A3 MAP TINT gate, part 2: at zoom 9 the sky-tone wash overlay is
  // present, carries a valid dominant-condition class, stays within the
  // opacity law (<= 0.12), and is STABLE across the ~600ms transition
  // window (no flicker — deterministic mode over the same visible towns).
  const tint = page.getByTestId('map-tint')
  await expect(tint).toBeVisible({ timeout: 10_000 })
  await expect(tint).toHaveAttribute('data-condition', /^(clear|overcast|rain|snow|storm)$/)
  const tintOpacity = Number(await tint.evaluate((el) => getComputedStyle(el).opacity))
  expect(tintOpacity).toBeLessThanOrEqual(0.12)
  const conditionBefore = await tint.getAttribute('data-condition')
  await page.waitForTimeout(700)
  await expect(tint).toHaveAttribute('data-condition', conditionBefore!)

  // S6 integration: alert banner lists the stubbed alert, and the Salina
  // badge carries a severity dot (contract consumer seam alertDotForTown).
  const banner = page.getByTestId('alert-banner')
  await expect(banner).toBeVisible({ timeout: 10_000 })
  await expect(banner).toContainText('Flood Warning (Severe)')
  const dot = page.getByTestId(`alert-dot-${SALINA_SLUG}`)
  await expect(dot).toBeVisible({ timeout: 10_000 })
  await expect(dot).toHaveAttribute('data-alert-severity', 'Severe')

  // Zoom back out (9 -> 6 -> 3): zoom-graded visibility hides badges.
  await tapOrClick(page, page.getByRole('button', { name: 'zoom out' }))
  await tapOrClick(page, page.getByRole('button', { name: 'zoom out' }))
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  // W3-A3: zooming back below 9 removes the tint overlay entirely.
  await expect(page.getByTestId('map-tint')).toHaveCount(0)

  // Gate 1: archive screenshot into docs/screenshots/L6/.
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await expect(page.locator('.town-badge').first()).toBeVisible({ timeout: 10_000 })
  await page.screenshot({
    path: path.join(SHOT_DIR, `badges-${testInfo.project.name}.png`),
    fullPage: false,
  })

  expect(errors).toEqual([])
})

test('mobile viewport: badge renders temp after tap-zoom', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await expect(badge.locator('.town-badge-temp')).toContainText(/-?\d+°/, { timeout: 10_000 })
  await page.screenshot({
    path: path.join(SHOT_DIR, `badges-mobile-tap-${testInfo.project.name}.png`),
  })
  expect(errors).toEqual([])
})
