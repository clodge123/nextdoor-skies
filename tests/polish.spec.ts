import { test, expect, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * W6 POLISH gate — owner field-test: "nav bar renders but has no CSS, tiny
 * at top". Drives the REAL app (root vite project via scripts/e2e-serve.mjs)
 * in all three viewports (R13: phone 390x844 / tablet 768x1024 / desktop
 * 1280x800). Asserts:
 *
 * 1. Header visible + brand/nav/toggle laid out; nav links >=44px hit boxes;
 *    active-route highlight follows the route (data-route attrs + .is-active).
 * 2. Badge tier rule: NO badges below TOWN_BADGE_MIN_ZOOM=9 (one zoom-in
 *    click 3->6 renders none — the old =6 regression); at zoom>=9 chips are
 *    square (R20), accent-bordered, >=40px, and the honest "awaiting feed"
 *    state is legible when the stub returns null temps.
 * 3. Mobile parity: zoom controls tappable >=44px, theme toggle >=44px,
 *    feed placeholder readable; every control visibly clickable.
 *
 * Console-clean (same documented exclusions as badges.spec.ts). Open-Meteo
 * stubbed (no real network); OpenFreeMap tiles relayed node-side.
 * Screenshots: docs/screenshots/W6/polish-<viewport>.png.
 */

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W6')
// W1 wave-2: the app GETs the same-origin /api/weather proxy (S5); the old
// api.open-meteo.com/v1/batch endpoint never existed. Stub the proxy the
// same way badges.spec.ts does (deterministic temps keyed by town slug).
const WEATHER_URL = /\/api\/weather\?.*/

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

/** Stub the weather proxy. tempsNull=true -> no temps (honest awaiting-feed). */
function stubOpenMeteo(page: Page, tempsNull = false) {
  return page.route(WEATHER_URL, async (route) => {
    if (!stubTowns) {
      stubTowns = (JSON.parse(readFileSync(TOWNS_PATH, 'utf8')) as { towns: NonNullable<typeof stubTowns> }).towns
    }
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
    const ladder = [21.4, -3.2, 8.7, 15.1, 0.5, 30.9, -12.4, 42.0]
    const temps: Record<string, number> = {}
    let i = 0
    if (!tempsNull) {
      for (const t of stubTowns) {
        if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) {
          temps[stubTownId(t.name, t.lat, t.lon)] = ladder[i++ % ladder.length]
        }
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps, stale: false }) })
  })
}

// S6 wave-2: the map page polls /api/alerts per window. Stub it (clear) so
// this spec makes zero real NWS calls and no 404 console noise enters the gate.
function stubAlerts(page: Page): Promise<void> {
  return page.route(/\/api\/alerts\?.*/, async (route) => {
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

async function setup(page: Page, tempsNull = false): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await stubOpenMeteo(page, tempsNull)
  await stubAlerts(page)
  // Center on Salina, KS (same as badges.spec.ts): zoom-9 viewports are
  // ~11km wide, so the default center sits between towns and no badge would
  // ever resolve temps there.
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  return errors
}

async function mapZoom(page: Page): Promise<number> {
  return page.evaluate(() => (window as { ndsMap?: { getZoom: () => number } }).ndsMap!.getZoom())
}

test('header: visible, >=44px nav hit boxes, active-route highlight, theme toggle', async ({ page }, testInfo) => {
  const errors = await setup(page)

  const header = page.locator('.app-header')
  await expect(header).toBeVisible()

  // Brand legible (not "tiny"): rendered font-size >= 13px.
  const brand = page.locator('.app-brand')
  await expect(brand).toBeVisible()
  const brandSize = await brand.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(brandSize).toBeGreaterThanOrEqual(13)

  // Nav links: visible, >=44px hit boxes in EVERY dimension (touch law).
  const mapLink = page.locator('.app-nav a[data-route="/"]')
  const feedLink = page.locator('.app-nav a[data-route="/feed"]')
  for (const link of [mapLink, feedLink]) {
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  // Active-route: on '/' Map is highlighted (accent border), Feed is not.
  await expect(mapLink).toHaveClass(/is-active/)
  await expect(feedLink).not.toHaveClass(/is-active/)
  const activeBorder = await mapLink.evaluate((el) => getComputedStyle(el).borderColor)
  expect(activeBorder).toBe('rgb(0, 255, 157)')

  // Tap Feed -> route changes, highlight follows (data-route attrs exist).
  await tapOrClick(page, feedLink)
  await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible()
  // Wave 2 honest state: no session -> identity gate, never a fake feed.
  await expect(page.getByTestId('identity-picker')).toBeVisible()
  await expect(feedLink).toHaveClass(/is-active/)
  await expect(mapLink).not.toHaveClass(/is-active/)
  // W3-C1: the phone drawer's Feed item also carries data-route="/feed";
  // count only the inline header nav.
  await expect(page.locator('.app-nav [data-route="/feed"].is-active')).toHaveCount(1)

  // Theme toggle: >=44px, visibly bordered, flips html[data-theme].
  // W3-C1: the phone drawer also carries a theme toggle; assert the inline
  // header one.
  const toggle = page.locator('.app-header-actions [data-testid="theme-toggle"]')
  await expect(toggle).toBeVisible()
  const tbox = await toggle.boundingBox()
  expect(tbox!.width).toBeGreaterThanOrEqual(44)
  expect(tbox!.height).toBeGreaterThanOrEqual(44)
  const themeBefore = await page.locator('html').getAttribute('data-theme')
  await tapOrClick(page, toggle)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', themeBefore ?? '')

  // Back to map for the screenshot (full chrome + map).
  await tapOrClick(page, mapLink)
  await expect(page.getByTestId('map-view')).toBeVisible()

  // Phone layout stacks: brand row sits ABOVE the nav links.
  if (testInfo.project.name === 'phone') {
    const brandBox = await brand.boundingBox()
    const navBox = await page.locator('.app-nav').boundingBox()
    expect(navBox!.y).toBeGreaterThan(brandBox!.y + brandBox!.height - 2)
  }

  await page.screenshot({ path: path.join(SHOT_DIR, `polish-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})

test('zoom controls tappable >=44px and badge tier rule (zoom-9, no badges below)', async ({ page }, testInfo) => {
  const errors = await setup(page)

  const zoomIn = page.getByRole('button', { name: 'zoom in' })
  const zoomOut = page.getByRole('button', { name: 'zoom out' })
  for (const btn of [zoomIn, zoomOut]) {
    await expect(btn).toBeVisible()
    const box = await btn.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  // Below grade: zoom 3 < 9 -> no badges at all.
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  // ONE zoom-in click (3 -> 6): 6 < 9, badges must STILL not render
  // (guards the old =6 constant regression).
  await tapOrClick(page, zoomIn)
  await expect.poll(() => mapZoom(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(6)
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  // Second click (6 -> 9): crosses TOWN_BADGE_MIN_ZOOM=9, badges appear.
  await tapOrClick(page, zoomIn)
  await expect.poll(() => mapZoom(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(9)
  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })

  // Chip visuals: square (R20), accent border, >=40px tap target, temp number.
  await expect(badge).toHaveCSS('border-radius', '0px')
  const bstyle = await badge.evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderColor, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }
  })
  expect(bstyle.border).toBe('rgb(0, 255, 157)')
  expect(bstyle.h).toBeGreaterThanOrEqual(40)
  await expect(badge.locator('.town-badge-temp')).toContainText(/-?\d+°/, { timeout: 10_000 })

  // Zoom back out below 9 (9 -> 6): overlay disappears again.
  await tapOrClick(page, zoomOut)
  await expect.poll(() => mapZoom(page), { timeout: 10_000 }).toBeLessThan(9)
  await expect(page.getByTestId('town-badges')).toHaveCount(0)

  expect(errors).toEqual([])
  void testInfo
})

test('awaiting-feed honest state legible at zoom>=9', async ({ page }, testInfo) => {
  const errors = await setup(page, /* tempsNull */ true)

  const zoomIn = page.getByRole('button', { name: 'zoom in' })
  await tapOrClick(page, zoomIn)
  await tapOrClick(page, zoomIn)
  await expect.poll(() => mapZoom(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(9)

  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })
  const label = badge.locator('.town-badge-temp')
  await expect(label).toContainText('awaiting feed', { timeout: 10_000 })

  // Legible: >=11px font, high-contrast color, square, >=40px tall.
  const style = await label.evaluate((el) => {
    const s = getComputedStyle(el)
    const r = (el.closest('.town-badge') as HTMLElement).getBoundingClientRect()
    return { size: parseFloat(s.fontSize), color: s.color, h: r.height, radius: getComputedStyle(el.closest('.town-badge')!).borderRadius }
  })
  expect(style.size).toBeGreaterThanOrEqual(11)
  expect(style.color).toBe('rgb(245, 245, 245)')
  expect(style.h).toBeGreaterThanOrEqual(40)
  expect(style.radius).toBe('0px')

  // Screenshot the polished map view (badges + header + controls) for the lane.
  await page.screenshot({ path: path.join(SHOT_DIR, `polish-badges-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})
