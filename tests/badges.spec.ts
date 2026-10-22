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
    // W3-A2: deterministic WMO weathercodes alongside temps (Open-Meteo
    // "wmo code" values; 61=rain, 0=clear, 3=overcast, 71=snow, 95=storm,
    // 45=fog). One town deliberately gets NO code to prove the honest
    // no-icon path (R19).
    const codeLadder = [61, 0, 3, 71, 95, 45]
    const temps: Record<string, number> = {}
    const codes: Record<string, number> = {}
    let i = 0
    for (const t of stubTowns) {
      if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) {
        const id = stubTownId(t.name, t.lat, t.lon)
        temps[id] = ladder[i % ladder.length]
        if (i % 6 !== 4) codes[id] = codeLadder[i % codeLadder.length] // town #5 mod 6: temp, no code
        i++
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps, codes, stale: false }) })
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

  // W3-A2 CONDITION ICONS: the first badge (Salina region, code ladder index
  // 0 -> weathercode 61 rain) carries a lucide <svg> inside the chip, and the
  // chip fades in on data arrival (fade-in law: .is-live class + computed
  // opacity 1 on the data wrapper; the 0->1 transition is pure CSS).
  const icon = badge.locator('[data-testid^="weather-icon-"]')
  await expect(icon.first()).toBeVisible({ timeout: 10_000 })
  await expect(icon.first().locator('svg')).toHaveCount(1)
  await expect(badge).toHaveClass(/is-live/)
  await expect(badge.locator('.town-badge-data')).toHaveCSS('opacity', '1', { timeout: 5_000 })

  // THEME-NEUTRALITY (owner law): the icon inherits var(--text) — exact
  // contrast check on BOTH data-theme states. The app's INITIAL theme
  // follows prefers-color-scheme (varies per viewport project), so both
  // states are driven explicitly via data-theme (the same seam ThemeToggle
  // uses) — deterministic, no reliance on the starting theme.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  const darkColor = await icon.first().evaluate((el) => getComputedStyle(el).color)
  expect(darkColor).toBe('rgb(245, 245, 242)') // --text dark: #f5f5f2
  // Light: --text #16161f, chip surface var(--surface) -> #ffffff.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  const lightColor = await icon.first().evaluate((el) => getComputedStyle(el).color)
  expect(lightColor).toBe('rgb(22, 22, 31)')
  const lightSurface = await badge.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(lightSurface).toBe('rgb(255, 255, 255)')
  // Restore dark for the remaining assertions.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

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
  // W3-A2 mobile parity: condition icon + fade-in class present on touch too.
  await expect(badge.locator('[data-testid^="weather-icon-"] svg').first()).toHaveCount(1)
  await expect(badge).toHaveClass(/is-live/)
  await page.screenshot({
    path: path.join(SHOT_DIR, `badges-mobile-tap-${testInfo.project.name}.png`),
  })
  expect(errors).toEqual([])
})
