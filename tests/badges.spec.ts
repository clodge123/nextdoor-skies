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
const BATCH_URL = 'https://api.open-meteo.com/v1/batch'

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
  return page.route(BATCH_URL, async (route) => {
    const body = route.request().postDataJSON() as {
      batch: Array<{ latitude: number; longitude: number }>
    }
    const temps = [21.4, -3.2, 8.7, 15.1, 0.5, 30.9, -12.4, 42.0]
    const response = {
      batch: body.batch.map((_, i) => ({
        current: { temperature_2m: temps[i % temps.length] },
      })),
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
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
  await page.goto('/', { waitUntil: 'domcontentloaded' })
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
  const errors = await setup(page)

  // Zoomed out (initial zoom 3, below TOWN_BADGE_MIN_ZOOM=6): no badges.
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  // ONE click of 'zoom in' (3 -> 6) crosses the badge zoom grade.
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))

  // At least one badge visible, carrying a real ° number (stubbed temps).
  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await expect(badge.locator('.town-badge-temp')).toContainText(/-?\d+°/, { timeout: 10_000 })

  // Square geometry (R20): zero border-radius.
  await expect(badge).toHaveCSS('border-radius', '0px')

  // Zoom back out (6 -> 3): zoom-graded visibility hides badges.
  await tapOrClick(page, page.getByRole('button', { name: 'zoom out' }))
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  // Gate 1: archive screenshot into docs/screenshots/L6/.
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await expect(page.locator('.town-badge').first()).toBeVisible({ timeout: 10_000 })
  await page.screenshot({
    path: path.join(SHOT_DIR, `badges-${testInfo.project.name}.png`),
    fullPage: false,
  })

  expect(errors).toEqual([])
})

test('mobile viewport: badge renders temp after tap-zoom', async ({ page }, testInfo) => {
  const errors = await setup(page)
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await expect(badge.locator('.town-badge-temp')).toContainText(/-?\d+°/, { timeout: 10_000 })
  await page.screenshot({
    path: path.join(SHOT_DIR, `badges-mobile-tap-${testInfo.project.name}.png`),
  })
  expect(errors).toEqual([])
})
