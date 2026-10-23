import { test, expect, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { markTourSeen } from './tour-seed'

/**
 * W4-B1 BADGE-ABOVE-LABEL — ACCEPTANCE GATE (wave-4 session 1, decision 3):
 * weather cards must NEVER cover town names. The law is a bounding-box
 * invariant measured on the real app:
 *
 *   badge.bottom <= label.top   (zero overlaps allowed)
 *
 * for EVERY visible town at zoom 8 / 10 / 12. The marker DOM is one stacked
 * column [badge][label][dot] per town (.town-marker), so the invariant is
 * structural — this spec proves it in a real browser with real layout at
 * three zoom levels, not in theory.
 *
 * Zoom-8 note: superseded by lane B2's merged ZOOM-MATCH law — tier bands
 * (not the legacy z9 global gate) drive badge visibility, so city-tier
 * badges may render below z9. The binding invariant is the bbox law itself:
 * measured pairs at zoom 8 must show ZERO overlaps (asserted).
 *
 * Stubbing mirrors tests/badges.spec.ts (OpenFreeMap relayed node-side,
 * /api/weather stubbed with deterministic temps) — no live network.
 */

const WEATHER_URL = /\/api\/weather\?.*/
const SALINA_CENTER = '-97.6114,38.8403'
const IGNORED = /GL Driver Message|Expected value to be of type .*null/

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (IGNORED.test(t)) return
    if (msg.type() === 'error') {
      // Law #4 (documented, same family as smoke-prod.mjs): relayed tile-
      // pyramid failures are WARNINGS — the node relay 502s only after its
      // own retries, and the UI must not flip. Attribute openfreemap
      // resource-load failures apart; app-origin console output stays empty.
      const url = msg.location()?.url ?? ''
      if (/Failed to load resource/.test(t) && url.includes('openfreemap.org')) return
      errors.push(t)
    }
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

function stubWeather(page: Page): void {
  // Deterministic temps (no RNG): fixed ladder keyed by town index.
  page.route(WEATHER_URL, async (route) => {
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
    const ladder = [70.5, 66.4, 31.3, 55.0, -2.5, 88.9]
    const temps: Record<string, number> = {}
    let i = 0
    for (const t of TOWN_LIST) {
      if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) {
        temps[t.id] = ladder[i++ % ladder.length]
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps, stale: false }) })
  })
}

// Mirror of slug/townId (api/weather.js + MapPage.townId): slugify(name) +
// 2dp lat/lon. Loaded lazily from the baked gazetteer so zoom windows see
// real ids (badges light up -> is-live chips -> real text layout).
import { readFileSync } from 'node:fs'
type Town = { id: string; lon: number; lat: number }
let TOWN_LIST: Town[] = []
function loadTowns(): void {
  if (TOWN_LIST.length) return
  const p = path.join(process.cwd(), 'data', 'towns', 'us-towns.json')
  const raw = JSON.parse(readFileSync(p, 'utf8')) as {
    towns: Array<{ name: string; lat: number; lon: number }>
  }
  TOWN_LIST = raw.towns.map((t) => ({
    id: `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${Math.round(t.lat * 100) / 100}-${Math.round(t.lon * 100) / 100}`,
    lon: t.lon,
    lat: t.lat,
  }))
}

async function setup(page: Page): Promise<string[]> {
  loadTowns()
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeather(page)
  await markTourSeen(page)
  await page.goto(`/?ndsCenter=${SALINA_CENTER}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  return errors
}

interface Pair {
  badgeBottom: number
  labelTop: number
}

/**
 * Measure every visible [badge,label] pair in the viewport. Returns
 * {pairs, overlaps}. A pair counts when BOTH boxes are fully inside the
 * viewport (off-screen layout is not proof). Sub-pixel float noise is
 * tolerated with a 0.5px epsilon; a real overlap is always larger.
 */
async function measurePairs(page: Page): Promise<{ pairs: number; overlaps: number }> {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    let pairs = 0
    let overlaps = 0
    for (const marker of document.querySelectorAll('.town-marker')) {
      const badge = marker.querySelector('.town-badge')
      const label = marker.querySelector('.town-marker-label')
      if (!badge || !label) continue
      const b = badge.getBoundingClientRect()
      const l = label.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      if (b.left < 0 || b.right > vw || b.top < 0 || b.bottom > vh) continue
      if (l.left < 0 || l.right > vw || l.top < 0 || l.bottom > vh) continue
      pairs += 1
      if (b.bottom > l.top + 0.5) overlaps += 1
    }
    return { pairs, overlaps }
  })
}

async function jumpTo(page: Page, zoom: number, center: [number, number] = [-97.6114, 38.8403]): Promise<void> {
  await page.evaluate(([c, z]) => {
    ;(window as { ndsMap: { jumpTo: (o: object) => void } }).ndsMap.jumpTo({ center: c, zoom: z })
  }, [center, zoom] as [number[], number])
  await page.waitForFunction(
    (z) => (window as { ndsMap: { getZoom: () => number } }).ndsMap.getZoom() >= z - 0.01,
    zoom,
    { timeout: 30_000 },
  )
  await page.waitForFunction(
    () => (window as { ndsMap: { areTilesLoaded: () => boolean } }).ndsMap.areTilesLoaded() === true,
    null,
    { timeout: 60_000 },
  )
}

test('bbox law: badge.bottom <= label.top for every visible town at zoom 8/10/12', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const errors = await setup(page)

  // --- zoom 8: city-tier band (z7-9) — Salina's label+badge render here
  // (zoom-match law), so the bbox law binds on a REAL named pair.
  await jumpTo(page, 8)
  const z8 = await measurePairs(page)
  expect(z8.overlaps, 'zoom 8: ZERO badge/label overlaps allowed').toBe(0)
  const salina8 = page.locator('.town-marker-label').filter({ hasText: /Salina/i }).first()
  await expect(salina8, 'zoom 8: city-tier Salina label renders (zoom-match)').toBeVisible({ timeout: 15_000 })

  // --- zoom 10 + 12: town-tier band (z10-24). Centered on Cross Lanes, WV
  // — the town-tier sample zoom-match.spec.ts probes (label visible z10-14,
  // pop ~2k), so a town-tier marker pair is deterministic here. (Salina is
  // city-tier: under the merged B2 zoom-match law its label leaves the
  // surface above z9, so centering on Salina made "badges visible at z10"
  // depend on which smaller towns happened to fall in the window — flaky.)
  const TOWN_TIER_CENTER: [number, number] = [-81.7907, 38.4204]
  for (const zoom of [10, 12]) {
    await jumpTo(page, zoom, TOWN_TIER_CENTER)
    const badges = page.locator('.town-badge')
    await expect(badges.first()).toBeVisible({ timeout: 15_000 })
    const markerCount = await page.locator('.town-marker').count()
    expect(markerCount).toBeGreaterThan(0)

    const { pairs, overlaps } = await measurePairs(page)
    expect(pairs, `zoom ${zoom}: at least one fully-visible pair expected`).toBeGreaterThan(0)
    expect(overlaps, `zoom ${zoom}: ZERO badge/label overlaps allowed`).toBe(0)

    // The label text is a real town name (names are never hidden).
    if (zoom >= 10) {
      const anyLabel = page.locator('.town-marker-label').first()
      await expect(anyLabel).toBeVisible({ timeout: 10_000 })
      expect((await anyLabel.textContent())?.trim().length).toBeGreaterThan(1)
    }

    await page.screenshot({
      path: path.join(process.cwd(), 'docs', 'screenshots', 'W4-B1', `bbox-zoom${zoom}-${testInfo.project.name}.png`),
    })
  }

  expect(errors).toEqual([])
})
