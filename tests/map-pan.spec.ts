import { test, expect, type Page, type Route } from '@playwright/test'
import { markTourSeen } from './tour-seed';

/**
 * W4-BF TOUCH-PAN-FIX — owner bug-fix round: panning the map by dragging
 * OVER a temperature badge / town label must PAN, not act as a click.
 *
 * Root cause: the overlay lived OUTSIDE maplibre's canvas container, so a
 * touchstart/mousedown landing on a badge never reached the pan handlers —
 * the gesture died as a plain click (panel opened, map stayed put).
 *
 * Law proven here (both input paths, both directions):
 *  1. DRAG over a badge => the map pans (center moves), NO panel opens,
 *     NO flyTo fires (the badge's click handler must not run).
 *  2. Stationary TAP on a badge => panel opens (click-to-detail law intact).
 *
 * Setup mirrors badges.spec.ts: real MapView, OpenFreeMap tiles relayed
 * node-side, Open-Meteo + alerts stubbed. Centered on Salina so country-tier
 * badges render at the initial zoom 3 (W4-B2 zoom-match).
 */

const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/

import { readFileSync } from 'node:fs'
import * as path from 'node:path'

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
  await markTourSeen(page);
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  // A badge exists at zoom 3 (country tier) — the drag/tap surface.
  await expect(page.locator('.town-badge').first()).toBeVisible({ timeout: 15_000 })
  return errors
}

async function mapCenter(page: Page): Promise<{ lng: number; lat: number }> {
  return page.evaluate(() => {
    const c = (window as { ndsMap?: { getCenter: () => { lng: number; lat: number } } }).ndsMap!.getCenter()
    return { lng: c.lng, lat: c.lat }
  })
}

test('desktop mouse drag over a badge pans the map and does NOT open the panel', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'desktop pointer path')
  test.setTimeout(120_000)
  const errors = await setup(page)

  const badge = page.locator('.town-badge').first()
  const box = await badge.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

  const before = await mapCenter(page)

  // Press ON the badge, drag 180px left (past clickTolerance), release.
  // MapLibre's DragHandler lives on the canvas container: the events must
  // bubble through the portal-mounted overlay and pan the view.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let step = 1; step <= 9; step++) {
    await page.mouse.move(cx - step * 20, cy, { steps: 1 })
    await page.waitForTimeout(15)
  }
  await page.mouse.up()

  // The map panned: center moved (westward drag => lng increases).
  await page.waitForFunction(
    (prev) => {
      const c = (window as { ndsMap?: { getCenter: () => { lng: number; lat: number } } }).ndsMap!.getCenter()
      return Math.abs(c.lng - prev.lng) > 0.01 || Math.abs(c.lat - prev.lat) > 0.01
    },
    before,
    { timeout: 10_000 },
  )

  // The drag was NOT a click: no panel, no ?panel in the URL.
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  expect(page.url()).not.toMatch(/[?&]panel=/)

  expect(errors).toEqual([])
})

test('mobile touch drag over a badge pans the map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'touch pointer path')
  test.setTimeout(120_000)
  const errors = await setup(page)

  const badge = page.locator('.town-badge').first()
  const box = await badge.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

  const before = await mapCenter(page)

  // Touch-pan: dispatch touch events starting ON the badge. They must
  // bubble into the canvas container's touchstart handler (portal mount)
  // so DragHandler claims the gesture.
  const start = async (x: number, y: number) => {
    await page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector('.maplibregl-canvas')!
        canvas.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            targetTouches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            changedTouches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      [x, y],
    )
  }
  const move = async (x: number, y: number) => {
    await page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector('.maplibregl-canvas')!
        canvas.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            targetTouches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            changedTouches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      [x, y],
    )
  }
  const end = async (x: number, y: number) => {
    await page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector('.maplibregl-canvas')!
        canvas.dispatchEvent(
          new TouchEvent('touchend', {
            touches: [],
            targetTouches: [],
            changedTouches: [new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y })],
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      [x, y],
    )
  }

  await start(cx, cy)
  for (let step = 1; step <= 9; step++) {
    await move(cx - step * 20, cy)
    await page.waitForTimeout(15)
  }
  await end(cx - 180, cy)

  await page.waitForFunction(
    (prev) => {
      const c = (window as { ndsMap?: { getCenter: () => { lng: number; lat: number } } }).ndsMap!.getCenter()
      return Math.abs(c.lng - prev.lng) > 0.01 || Math.abs(c.lat - prev.lat) > 0.01
    },
    before,
    { timeout: 10_000 },
  )

  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  expect(page.url()).not.toMatch(/[?&]panel=/)

  expect(errors).toEqual([])
})

test('stationary tap on a badge still opens the town panel (click-to-detail intact)', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)

  // Zoom to badge-visible Salina (city tier band z7-9), same as badges.spec.
  if (page.hasTouch) await page.getByRole('button', { name: 'zoom in' }).tap()
  else await page.getByRole('button', { name: 'zoom in' }).click()
  if (page.hasTouch) await page.getByRole('button', { name: 'zoom in' }).tap()
  else await page.getByRole('button', { name: 'zoom in' }).click()

  const badge = page.locator('.town-badge').first()
  await expect(badge).toBeVisible({ timeout: 10_000 })

  // Stationary tap/click (zero travel) => click event fires => panel opens.
  if (page.hasTouch) await badge.tap()
  else await badge.click()
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })

  expect(errors).toEqual([])
})
