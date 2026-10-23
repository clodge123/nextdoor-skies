// W4-A1 UNITS-CORE e2e — badges + town panel render Fahrenheit by default
// (wave-4 session 1 law: "F everywhere", honest F default in private mode).
//
// Self-contained: stubs /api/weather with deterministic F temps (same ladder
// law as badges.spec.ts), zooms past the badge grade, asserts every rendered
// temperature carries the °F suffix (no raw-Celsius surface), then opens the
// Salina panel and asserts its temp chip is °F too. Desktop project only —
// this is the lane's ONE gated Playwright run (browser-traffic law).
import { test, expect, type Page, type Route } from '@playwright/test'
import { markTourSeen } from './tour-seed'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/
const SALINA_SLUG = 'salina-38.84--97.61'
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
    // Deterministic F temps (no RNG): same ladder law as badges.spec.ts.
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
      body: JSON.stringify({ alerts: [], stale: false }),
    })
  })
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await stubOpenMeteo(page)
  await stubAlerts(page)
  await markTourSeen(page)
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  return errors
}

test('badges + town panel render °F with no stored unit (F default law)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one gated desktop run (browser-traffic law)')
  test.setTimeout(150_000)
  const errors = await setup(page)

  // Zoom past the badge grade (3 -> 6 -> 9).
  await page.getByRole('button', { name: 'zoom in' }).click()
  await page.getByRole('button', { name: 'zoom in' }).click()

  // Every visible badge temp ends in °F — no raw-Celsius surface renders.
  const temps = page.locator('.town-badge-temp')
  await expect(temps.first()).toBeVisible({ timeout: 10_000 })
  const count = await temps.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(temps.nth(i)).toContainText(/^-?\d+°F$/, { timeout: 10_000 })
  }

  // Open the Salina panel (badge click) — panel temp chip is °F as well.
  const badge = page.getByTestId(`town-badge-${SALINA_SLUG}`)
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await badge.click()
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('town-panel-temp')).toContainText(/^-?\d+°F$/, { timeout: 10_000 })

  // Honest F default: nothing was persisted (private-mode law) — storage
  // carries no nds-units key, yet the surface shows F.
  const stored = await page.evaluate(() => {
    try {
      return localStorage.getItem('nds-units')
    } catch {
      return 'THROWS'
    }
  })
  expect(stored === null || stored === 'THROWS').toBe(true)

  expect(errors).toEqual([])
})

// W4-G1 matrix completion (session 6 law 1): "toggle persists (nds-units)"
// was only proven by the A2 lane spec — the wave-4 gate re-proves it inside
// the units matrix: F -> C flips every badge, storage lands, reload keeps C
// WITHOUT interaction, and the storage-cleared reload returns to the honest
// F default (private-mode law).
test('toggle persists: C survives reload via nds-units; cleared storage returns to F', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one gated desktop run (browser-traffic law)')
  test.setTimeout(150_000)
  const errors = await setup(page)

  await page.getByRole('button', { name: 'zoom in' }).click()
  await page.getByRole('button', { name: 'zoom in' }).click()
  const badgeTemp = page.locator('.town-badge-temp').first()
  await expect(badgeTemp).toBeVisible({ timeout: 10_000 })
  await expect(badgeTemp).toContainText(/°F$/, { timeout: 10_000 })

  // Flip to C — badges follow live, the storage key lands.
  await page.getByRole('button', { name: 'Show temperatures in Celsius' }).click()
  await expect(badgeTemp).toContainText(/°C$/, { timeout: 10_000 })
  expect(await page.evaluate(() => localStorage.getItem('nds-units'))).toBe('C')

  // Reload: persistence WITHOUT any interaction (the nds-units seam).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  await page.getByRole('button', { name: 'zoom in' }).click()
  await page.getByRole('button', { name: 'zoom in' }).click()
  const badgeAfter = page.locator('.town-badge-temp').first()
  await expect(badgeAfter).toBeVisible({ timeout: 10_000 })
  await expect(badgeAfter).toContainText(/°C$/, { timeout: 10_000 })

  // Private-mode honesty: clearing storage restores the F default on load.
  await page.evaluate(() => localStorage.removeItem('nds-units'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  await page.getByRole('button', { name: 'zoom in' }).click()
  await page.getByRole('button', { name: 'zoom in' }).click()
  await expect(page.locator('.town-badge-temp').first()).toContainText(/°F$/, { timeout: 10_000 })

  expect(errors).toEqual([])
})
