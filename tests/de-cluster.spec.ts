import { test, expect, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { markTourSeen } from './tour-seed'

/**
 * W4-B3 DE-CLUSTER ACCEPTANCE (wave-4 session 1, decision 5; lane gate:
 * "cluster badge = 1 per same-temp group at low zoom"):
 *
 *   1. LOW ZOOM: same-temp neighboring towns collapse to ONE badge labeled
 *      "Moore +N" — exactly ONE badge per same-temp group (no individual
 *      badges leak alongside their cluster).
 *   2. EXPAND ON ZOOM-IN: jumping above CLUSTER_MAX_ZOOM (9) renders every
 *      member's own badge again (solo DOM, byte-identical to pre-B3).
 *   3. EXPAND ON TAP: clicking a cluster badge is the fly-to law — the map
 *      flies to the group centroid and lands at zoom 9, expanded.
 *   4. NO OVERLAP REGRESSION (W4-B1 law): badge.bottom <= label.top for
 *      every rendered column at the cluster zoom.
 *
 * Data flow honesty: temps are real app state — the refresher fills them
 * while zoom >= 9, and last-data-wins keeps them while zooming out (that is
 * exactly the metro pattern: you zoom out from a live view). The weather
 * stub returns ONE constant temp for every town in the requested bbox, so
 * grouping is spatial-only and fully deterministic. Zero live network.
 *
 * Center: Moore, OK (35.34, -97.487) — the contract's own example
 * (Moore/Mustang/Oklahoma City, all 21°C -> same shown °F).
 */

const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/
const CENTER = '-97.487,35.34'
const IGNORED = /GL Driver Message|Expected value to be of type .*null|Failed to load resource.*502/

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (IGNORED.test(t)) return
    if (msg.type() === 'error') {
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
  // Tile errors stay warnings (law #4): the relay 502s only after retries.
  await route.fulfill({ status: 502, body: String(lastErr) })
}

/** One constant F temp for EVERY town in the bbox -> spatial-only grouping. */
function stubWeatherConstant(page: Page): void {
  page.route(WEATHER_URL, async (route) => {
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
    const temps: Record<string, number> = {}
    for (const t of TOWN_LIST) {
      if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) temps[t.id] = 70.0
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ temps, stale: false }),
    })
  })
}

function stubAlerts(page: Page): void {
  page.route(ALERTS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ alerts: [], stale: false }),
    })
  })
}

// Mirror of api/weather.js slug/townId (slug-name-lat-lon, 2dp).
const TOWNS_PATH = path.join(process.cwd(), 'data', 'towns', 'us-towns.json')
const TOWN_LIST: Array<{ id: string; name: string; lat: number; lon: number }> = (() => {
  const towns = (JSON.parse(readFileSync(TOWNS_PATH, 'utf8')) as {
    towns: Array<{ name: string; lat: number; lon: number }>
  }).towns
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return towns.map((t) => ({
    id: `${slug(t.name)}-${Math.round(t.lat * 100) / 100}-${Math.round(t.lon * 100) / 100}`,
    name: t.name,
    lat: t.lat,
    lon: t.lon,
  }))
})()

/** Jump and settle (idle) — deterministic test seam, not UI animation. */
async function settleAt(page: Page, zoom: number): Promise<void> {
  await page.evaluate(
    async ({ zoom }) => {
      const m = (window as { ndsMap?: any }).ndsMap
      m.jumpTo({ center: [-97.487, 35.34], zoom })
      await new Promise<void>((res) => {
        const t = setTimeout(res, 3500)
        m.once('idle', () => { clearTimeout(t); res() })
      })
    },
    { zoom },
  )
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeatherConstant(page)
  stubAlerts(page)
  // Returning-visitor seed (shared helper): the first-visit tour scrim
  // captures pointer events and would swallow the cluster tap.
  await markTourSeen(page)
  await page.goto(`/?ndsCenter=${CENTER}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 60_000 },
  )
  return errors
}

/** Snapshot of every rendered badge column: solo badges + cluster markers. */
interface BadgeState {
  soloCount: number
  clusters: Array<{ repId: string; size: number; townIds: string[]; label: string }>
  clusterBadgeCount: number
}

async function badgeState(page: Page): Promise<BadgeState> {
  return page.evaluate(() => {
    const clusters = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="town-marker-cluster-"]'),
    ).map((el) => ({
      repId: el.dataset.townId ?? '',
      size: Number(el.dataset.clusterSize),
      townIds: (el.dataset.clusterTownIds ?? '').split(','),
      label: el.querySelector('.town-badge-cluster-count')?.textContent ?? '',
    }))
    const soloCount = document.querySelectorAll('.town-badge:not(.town-badge-cluster)').length
    const clusterBadgeCount = document.querySelectorAll('.town-badge-cluster').length
    return { soloCount, clusters, clusterBadgeCount }
  })
}

test('de-cluster: one badge per same-temp group at low zoom, expands on zoom/tap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only (one gated run law)')
  test.setTimeout(240_000)
  const errors = await setup(page)

  // ---- Fill data honestly: zoom 9 (refresher runs; CITY tier renders
  // z7-9 — the same town set the z7 cluster will partition), centered on
  // Moore. ----
  await settleAt(page, 9)
  await expect(page.locator('.town-badge').first()).toBeVisible({ timeout: 20_000 })
  // At zoom >= CLUSTER_MAX_ZOOM clustering is OFF: every badge-visible town
  // renders its own badge — the pre-B3 DOM, zero cluster markers.
  const zHi = await badgeState(page)
  expect(zHi.clusterBadgeCount).toBe(0)
  expect(zHi.soloCount).toBeGreaterThan(1)
  const soloAtZ9 = zHi.soloCount

  // ---- Zoom OUT to 7: same temps (last-data-wins) + closer points ->
  // same-temp neighbors collapse. THE LAW: exactly ONE badge per group. ----
  await settleAt(page, 7)
  const z7 = await badgeState(page)
  expect(z7.clusterBadgeCount).toBeGreaterThan(0)
  // One badge per group: no solo badge shares a group with a cluster, and
  // every cluster carries >= 2 members.
  const soloIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.town-badge[data-town-id]')).map(
      (el) => el.dataset.townId!,
    ),
  )
  for (const c of z7.clusters) {
    expect(c.size).toBeGreaterThanOrEqual(2)
    expect(c.townIds).toContain(c.repId)
    for (const id of c.townIds.slice(1)) expect(soloIds).not.toContain(id)
    // Label law: "Name +N" with N = hidden members.
    expect(c.label).toMatch(new RegExp(`\\+${c.size - 1}$`))
  }
  // Conservation: every town is in EXACTLY ONE badge — solo badge XOR
  // cluster membership, no town counted twice, none dropped.
  const membersInClusters = z7.clusters.reduce((s, c) => s + c.size, 0)
  const allClusteredIds = z7.clusters.flatMap((c) => c.townIds)
  expect(new Set(allClusteredIds).size).toBe(membersInClusters)
  for (const id of allClusteredIds) expect(soloIds).not.toContain(id)

  // ---- No overlap regression (W4-B1 law) at the cluster zoom. ----
  const overlaps = await page.evaluate(() => {
    let n = 0
    for (const marker of Array.from(document.querySelectorAll('.town-marker'))) {
      const badge = marker.querySelector('.town-badge')
      const label = marker.querySelector('.town-marker-label')
      if (badge && label) {
        const b = badge.getBoundingClientRect()
        const l = label.getBoundingClientRect()
        if (b.bottom > l.top + 0.5) n++
      }
    }
    return n
  })
  expect(overlaps).toBe(0)

  // Square geometry (R20) on the cluster badge.
  await expect(page.locator('.town-badge-cluster').first()).toHaveCSS('border-radius', '0px')

  // ---- EXPAND ON ZOOM-IN: back to 9, every town solo again. Every
  // clustered town INSIDE the zoom-9 viewport (it is narrower than z7's)
  // renders its own badge here — no phantom members, correct expansion. ----
  await settleAt(page, 9)
  const zHiB = await badgeState(page)
  expect(zHiB.clusterBadgeCount).toBe(0)
  expect(zHiB.soloCount).toBeGreaterThan(1)
  const soloIdsHi = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.town-badge[data-town-id]')).map(
      (el) => el.dataset.townId!,
    ),
  )
  const bounds = await page.evaluate(() => {
    const b = (window as { ndsMap?: any }).ndsMap.getBounds()
    return {
      w: b.getSouthWest().lng, e: b.getNorthEast().lng,
      s: b.getSouthWest().lat, n: b.getNorthEast().lat,
    }
  })
  let checked = 0
  for (const id of allClusteredIds) {
    // Town id shape: <slug>-<lat>-<lon> with lat > 0 (US) and lon < 0,
    // e.g. "moore-35.34--97.49". Anchor on the POSITIVE lat so the greedy
    // regex cannot swallow the lat's own sign separator.
    const m = id.match(/(\d+\.\d+)-(-\d+\.\d+)$/)
    expect(m, `unparseable town id: ${id}`).not.toBeNull()
    const [, latS, lonS] = m!
    const lat = Number(latS)
    const lon = Number(lonS)
    if (lat >= bounds.s && lat <= bounds.n && lon >= bounds.w && lon <= bounds.e) {
      expect(soloIdsHi, `clustered town ${id} must expand solo at z9`).toContain(id)
      checked++
    }
  }
  expect(
    checked,
    `clustered=[${allClusteredIds.join(',')}] bounds=${JSON.stringify(bounds)} soloHi=[${soloIdsHi.join(',')}]`,
  ).toBeGreaterThan(0)

  // ---- EXPAND ON TAP: click a cluster badge = fly-to law. ----
  await settleAt(page, 7)
  const cluster = page.locator('.town-badge-cluster').first()
  await expect(cluster).toBeVisible({ timeout: 10_000 })
  const tappedSize = Number(await cluster.getAttribute('data-cluster-size'))
  expect(tappedSize).toBeGreaterThanOrEqual(2)
  await cluster.click()
  // Fly-to (~1.8s animation law) lands at zoom 9: clustering OFF, expanded.
  await expect
    .poll(
      async () => {
        const s = await badgeState(page)
        return s.clusterBadgeCount === 0 && s.soloCount > 0 ? s.soloCount : 0
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0)
  const zoomAfterTap = await page.evaluate(() => (window as { ndsMap?: any }).ndsMap.getZoom())
  expect(zoomAfterTap).toBeGreaterThanOrEqual(9)

  expect(errors).toEqual([])
})
