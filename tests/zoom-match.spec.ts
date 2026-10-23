import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * W4-B2 ZOOM-MATCH ACCEPTANCE (wave-4 session-1 law #4):
 * "A town's badge appears EXACTLY when its map label appears."
 *
 * For one sample town per tier (country/state/city/town), at zoom
 * z ∈ {6, 8, 10, 12, 14}, assert:
 *
 *   badge in DOM  <=>  town label rendered by the basemap at z
 *
 * Ground truth for the label side is the map ITSELF:
 * map.queryRenderedFeatures() over the nds-labels-* symbol layers (the same
 * evidence source scripts/probe-label-visibility.mjs used to derive the
 * thresholds — country z1-3, state z4-6, city z7-9, town z10+, see
 * docs/metrics/W4-B2-label-visibility.json). The badge side is the real
 * TownBadges overlay mounting the REAL app (no stub component).
 *
 * Runs desktop-only (the full matrix is 4 towns x 5 zooms; the fleet browser
 * law keeps this ONE gated run cheap). Zoom changes use jumpTo (instant,
 * deterministic — no animation-law violation, this is a test seam, not UI).
 *
 * Console exclusions: documented maplibre/third-party chatter, same family
 * as badges.spec.ts / map.spec.ts. App-origin console output must be empty.
 */

const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/
const LABEL_LAYERS = ['nds-labels-country', 'nds-labels-state', 'nds-labels-city', 'nds-labels-town']
const ZOOMS = [6, 8, 10, 12, 14] as const

// One sample per tier: highest-population town of that tier whose label the
// probe confirmed visible across its band (data/towns/us-towns.json).
interface Sample {
  name: string
  tier: 'country' | 'state' | 'city' | 'town'
  lat: number
  lon: number
}
const SAMPLES: Sample[] = [
  { name: 'New York City', tier: 'country', lat: 40.7143, lon: -74.006 },
  { name: 'Austin', tier: 'state', lat: 30.2672, lon: -97.7431 },
  { name: 'Salina', tier: 'city', lat: 38.8403, lon: -97.6114 },
  { name: 'Cross Lanes', tier: 'town', lat: 38.4204, lon: -81.7907 },
]

// Mirror of MapPage.townId (slug + 2dp coords) — the badge data-town-id key.
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function badgeId(t: Sample): string {
  return `${slugify(t.name)}-${Math.round(t.lat * 100) / 100}-${Math.round(t.lon * 100) / 100}`
}

// Documented exclusions (honest state, same family as badges.spec.ts):
// - GL Driver Message: headless swiftshader/ANGLE perf chatter.
// - "Expected value to be of type ... null": maplibre style-spec validation
//   chatter parsing THIRD-PARTY OpenFreeMap expressions, never app-origin.
// - "Failed to load resource ... 502": the node-side OFM relay retries
//   transient egress-proxy 502s; if all retries exhaust, maplibre treats the
//   tile as a WARNING (law #4) and the browser logs the failed resource —
//   third-party tile traffic, never app-origin. App-origin output is gated.
const IGNORED = /GL Driver Message|Expected value to be of type .*null|Failed to load resource.*502/

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

// Weather/alerts stubs: zero real network. Temps keyed by the SAME slug ids
// the client computes, so zoom-9+ windows light badges honestly.
function stubOpenMeteo(page: Page): Promise<void> {
  return page.route(WEATHER_URL, async (route) => {
    const params = new URL(route.request().url()).searchParams
    const [lng1, lat1, lng2, lat2] = params.get('bbox')!.split(',').map(Number)
    const w = Math.min(lng1, lng2), e = Math.max(lng1, lng2)
    const s = Math.min(lat1, lat2), n = Math.max(lat1, lat2)
    const temps: Record<string, number> = {}
    for (const t of SAMPLES) {
      if (t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n) {
        temps[badgeId(t)] = 68.0
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ temps, stale: false }) })
  })
}
function stubAlerts(page: Page): Promise<void> {
  return page.route(ALERTS_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [], stale: false }) })
  })
}

/** Jump to (lat, lon, zoom) and wait for the map to fully settle (idle). */
async function settleAt(page: Page, t: Sample, zoom: number): Promise<void> {
  await page.evaluate(
    async ({ lon, lat, zoom }) => {
      const m = (window as { ndsMap?: any }).ndsMap
      m.jumpTo({ center: [lon, lat], zoom })
      await new Promise<void>((res) => {
        const t = setTimeout(res, 3500)
        m.once('idle', () => { clearTimeout(t); res() })
      })
    },
    { lon: t.lon, lat: t.lat, zoom },
  )
}

/** Is the town's LABEL rendered by the basemap at the current view? */
async function labelVisible(page: Page, t: Sample): Promise<boolean> {
  return page.evaluate(
    ({ name, layers }) => {
      const m = (window as { ndsMap?: any }).ndsMap
      const feats = m.queryRenderedFeatures({ layers })
      return feats.some((f: { properties?: { name?: string } }) => f.properties?.name === name)
    },
    { name: t.name, layers: LABEL_LAYERS },
  )
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await stubOpenMeteo(page)
  await stubAlerts(page)
  await page.goto('/?ndsCenter=-98.5,39.8', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 60_000 },
  )
  return errors
}

for (const t of SAMPLES) {
  test(`zoom-match: ${t.name} (${t.tier}) — badge ⟺ label at z=${ZOOMS.join(',')}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only matrix (one gated run law)')
    test.setTimeout(180_000)
    const errors = await setup(page)
    const id = badgeId(t)
    for (const z of ZOOMS) {
      await settleAt(page, t, z)
      const label = await labelVisible(page, t)
      const badge = page.locator(`.town-badge[data-town-id="${id}"]`)
      const badgeCount = await badge.count()
      // THE LAW: badge visible ⟺ map label visible. No drift, no lag.
      expect(
        badgeCount > 0,
        `${t.name} (${t.tier}) @ z${z}: badge=${badgeCount > 0} label=${label}`,
      ).toBe(label)
    }
    expect(errors).toEqual([])
  })
}
