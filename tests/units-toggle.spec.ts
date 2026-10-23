import { test, expect, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { mkdirSync } from 'node:fs'
import { markTourSeen } from './tour-seed'

/**
 * W4-A2 UNIT-TOGGLE — Gate 1 browser spec (wave-4 session 1 decision 2).
 * Drives the REAL app (root vite project via scripts/e2e-serve.mjs), same
 * stub family as badges.spec.ts (Open-Meteo proxy + /api/alerts stubbed,
 * OpenFreeMap tiles relayed node-side).
 *
 * Contract asserted end-to-end:
 *  1. Header pill exists beside the theme toggle: two segments, >=44px each,
 *     square (border-radius 0px), active segment painted neon-green
 *     (var(--current-accent) = #00ff9d at the default accent), aria-pressed
 *     marks the active unit, F pressed by default (honest F, "this is
 *     America").
 *  2. Click C -> badge temps flip from °F to °C live (the nds-units-changed
 *     seam drives the surface) and localStorage 'nds-units' === 'C'.
 *  3. Reload -> the choice persists: pill shows C pressed, badge temps still
 *     °C without any user interaction beyond load.
 *
 * Console-clean with the documented exclusions (GL driver + third-party
 * style-spec chatter), identical family to badges.spec.ts.
 */

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W4-A2')
const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/

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

/**
 * Deterministic F temps (no RNG): fixed ladder per town index, same shape as
 * badges.spec.ts. 70.5F -> badge shows "71°F" (F default) / "21°C" (C mode).
 */
function stubWeather(page: Page): Promise<void> {
  return page.route(WEATHER_URL, async (route) => {
    if (!stubTowns) {
      stubTowns = (JSON.parse(readFileSync(TOWNS_PATH, 'utf8')) as { towns: typeof stubTowns }).towns!
    }
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
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

async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap()
  else await locator.click()
}

async function setup(page: Page): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await stubWeather(page)
  await stubAlerts(page)
  // Center on Salina, KS (same trick as badges.spec.ts): zoom-9 viewports
  // resolve real baked towns so stubbed temps land on visible badges.
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

/** Zoom 3 -> 9 (MapView steps +3 per click). */
async function zoomToBadges(page: Page): Promise<void> {
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
}

test.describe('W4-A2 unit toggle', () => {
  test('pill geometry + F default; click C flips badges to °C + persists; reload keeps °C', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const errors = await setup(page)

    // --- 1. Pill exists beside the theme toggle, honest F default.
    const pill = page.getByTestId('unit-toggle')
    await expect(pill.first()).toBeVisible()
    const segF = page.getByRole('button', { name: 'Show temperatures in Fahrenheit' })
    const segC = page.getByRole('button', { name: 'Show temperatures in Celsius' })
    await expect(segF.first()).toBeVisible()
    await expect(segC.first()).toBeVisible()
    // aria-pressed: F active by default, C not (discoverability + AT law).
    await expect(segF.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(segC.first()).toHaveAttribute('aria-pressed', 'false')

    // >=44px targets (R13) + square geometry (R20) on every segment.
    for (const seg of [segF.first(), segC.first()]) {
      const box = (await seg.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await expect(seg).toHaveCSS('border-radius', '0px')
    }
    // Active segment painted neon-green (C-01: var(--current-accent) =
    // #00ff9d = rgb(0,255,157) under the default accent).
    const activeBg = await segF.first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(activeBg).toBe('rgb(0, 255, 157)')

    // --- 2. F-default badge temps, then click C -> live °C flip.
    await zoomToBadges(page)
    const badgeTemp = page.locator('.town-badge-temp').first()
    await expect(badgeTemp).toBeVisible({ timeout: 10_000 })
    await expect(badgeTemp).toContainText(/°F$/, { timeout: 10_000 })
    // Numeric sanity (same badge, same data): capture the F reading BEFORE
    // the switch; the C render must be its conversion, not a mystery number.
    // Tolerance ±1: both displays round the SAME underlying value, so the
    // F->C inverse is bounded by double rounding (71F => 21.67C => 22/21).
    const fText = (await badgeTemp.textContent())!
    const fVal = Number(fText.replace(/°F$/, ''))

    await tapOrClick(page, segC.first())
    // aria-pressed follows; storage key lands; badges re-render in °C.
    await expect(segC.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(segF.first()).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => localStorage.getItem('nds-units'))).toBe('C')
    await expect(badgeTemp).toContainText(/°C$/, { timeout: 10_000 })
    const cVal = Number((await badgeTemp.textContent())!.replace(/°C$/, ''))
    expect(Math.abs(cVal - ((fVal - 32) * 5) / 9)).toBeLessThanOrEqual(1)

    // --- 3. Reload -> persistence via localStorage (no interaction).
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
    await page.waitForFunction(
      () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
      null,
      { timeout: 45_000 },
    )
    const segC2 = page.getByRole('button', { name: 'Show temperatures in Celsius' })
    const segF2 = page.getByRole('button', { name: 'Show temperatures in Fahrenheit' })
    await expect(segC2.first()).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })
    await expect(segF2.first()).toHaveAttribute('aria-pressed', 'false')
    await zoomToBadges(page)
    await expect(page.locator('.town-badge-temp').first()).toContainText(/°C$/, { timeout: 10_000 })

    // Keyboard reachability (law): Tab order reaches the pill — the segments
    // are native buttons; focus them from the keyboard and activate with Enter.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    const cSeg = page.getByRole('button', { name: 'Show temperatures in Fahrenheit' }).first()
    await cSeg.focus()
    await page.keyboard.press('Enter') // activate F back via keyboard
    await expect(page.getByRole('button', { name: 'Show temperatures in Fahrenheit' }).first()).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('nds-units'))).toBe('F')

    // Archive screenshot (Gate 1 law).
    await page.screenshot({ path: path.join(SHOT_DIR, `units-toggle-${testInfo.project.name}.png`) })

    expect(errors).toEqual([])
  })
})
