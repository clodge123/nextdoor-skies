import { test, expect, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * W3-C2 ALERT CENTER — Gate 1 browser spec. Drives the REAL app (root vite
 * project via scripts/e2e-serve.mjs), /api/alerts stubbed deterministically:
 *   1. Panel: stubbed alerts render severity-sorted rows (Extreme first),
 *      expand on click, town line flies the map (fly-to seam), banner stays
 *      GONE (alert-banner count 0 — the C1 law C2 inherits).
 *   2. /alerts page: the SAME list, full-page.
 *   3. Stale stub: "Feed unavailable — showing last known" indicator.
 *
 * Console exclusions (documented, same family as badges/shell specs): GL
 * driver + third-party style-spec chatter. Tiles relayed node-side.
 */

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W3-C2')
const IGNORED = /GL Driver Message|Expected value to be of type .*null/
const SALINA_SLUG = 'salina-38.84--97.61'
const HAYS_SLUG = 'hays-38.88--99.33'
const BEND_SLUG = 'great-bend-38.36--98.76'

/** Deterministic stub payload: three towns, four severity levels present. */
const STUB_ALERTS = [
  {
    id: 'urn:oid:stub-tornado',
    event: 'Tornado Warning',
    town: SALINA_SLUG,
    severity: 'Extreme',
    headline: 'Tornado detected 4km west of Salina',
    summary: 'Take shelter immediately in a sturdy interior room.',
    effective: '2026-10-21T15:04:00-05:00',
    expires: '2026-10-21T15:45:00-05:00',
  },
  {
    id: 'urn:oid:stub-flood',
    event: 'Flood Warning',
    town: HAYS_SLUG,
    severity: 'Severe',
    headline: 'Smoky Hill River cresting above flood stage',
    effective: '2026-10-21T12:00:00-05:00',
    expires: '2026-10-21T18:00:00-05:00',
  },
  {
    id: 'urn:oid:stub-heat',
    event: 'Heat Advisory',
    town: BEND_SLUG,
    severity: 'Minor',
    headline: 'Heat index up to 105F through Friday evening',
    effective: '2026-10-21T10:00:00-05:00',
    expires: null,
  },
]

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

/** Weather proxy: temps irrelevant here; answer empty so badges stay quiet. */
function stubWeather(page: Page): Promise<void> {
  return page.route(/\/api\/weather\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ temps: {}, stale: false }),
    })
  })
}

function stubAlerts(page: Page, payload: unknown): Promise<void> {
  return page.route(/\/api\/alerts\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

async function setupMap(page: Page, payload: unknown): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  await stubWeather(page)
  await stubAlerts(page, payload)
  await page.goto('/?ndsCenter=-97.6114,38.8403', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  return errors
}

async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap()
  else await locator.click()
}

test('panel alert center: sorted rows, expand, fly-to, banner gone', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setupMap(page, { alerts: STUB_ALERTS, stale: false })

  // The center fills the side-panel slot (open by default on desktop/tablet;
  // collapsed sheet on phone — expand it there first).
  const panel = page.getByTestId('side-panel')
  if (testInfo.project.name === 'phone') {
    await tapOrClick(page, page.getByTestId('panel-handle'))
  }
  await expect(panel).toHaveAttribute('data-open', 'true')
  const center = page.getByTestId('alert-center')
  await expect(center).toBeVisible({ timeout: 15_000 })

  // Severity sort law: Extreme > Severe > Minor (id tie-break unused here).
  const rows = page.getByTestId('alert-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Tornado Warning')
  await expect(rows.nth(0).getByTestId('alert-severity')).toHaveText('Extreme')
  await expect(rows.nth(1)).toContainText('Flood Warning')
  await expect(rows.nth(1).getByTestId('alert-severity')).toHaveText('Severe')
  await expect(rows.nth(2)).toContainText('Heat Advisory')
  await expect(rows.nth(2).getByTestId('alert-severity')).toHaveText('Minor')

  // Deterministic stamps (formatStamp law): no Date.now in render.
  await expect(rows.nth(0)).toContainText('2026-10-21 15:04')
  await expect(rows.nth(0)).toContainText('2026-10-21 15:45')

  // Expand-on-click: row 1 headline grows from truncated preview to full.
  const toggle0 = rows.nth(0).getByTestId('alert-row-toggle')
  await expect(toggle0).toHaveAttribute('aria-expanded', 'false')
  await tapOrClick(page, toggle0)
  await expect(toggle0).toHaveAttribute('aria-expanded', 'true')
  await expect(rows.nth(0).locator('.alert-row-headline')).toHaveClass(/is-expanded/)

  // Fly-to seam: click the Hays town line -> map center lands on Hays.
  const flyHays = rows.nth(1).getByTestId('alert-row-fly')
  await expect(flyHays).toHaveText('Hays')
  await tapOrClick(page, flyHays)
  await page.waitForFunction(
    () => {
      const c = (window as { ndsMap?: { getCenter(): { lng: number; lat: number } } }).ndsMap?.getCenter()
      return !!c && Math.abs(c.lng - -99.3268) < 0.05 && Math.abs(c.lat - 38.8792) < 0.05
    },
    null,
    { timeout: 15_000 },
  )

  // Banner law (inherited from C1): the overlay must stay GONE.
  await expect(page.getByTestId('alert-banner')).toHaveCount(0)

  await page.screenshot({ path: path.join(SHOT_DIR, `center-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})

test('stale feed: honest "Feed unavailable — showing last known"', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setupMap(page, { alerts: STUB_ALERTS.slice(0, 1), stale: true })

  const center = page.getByTestId('alert-center')
  await expect(center).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('alert-center-stale')).toContainText('Feed unavailable — showing last known')
  // Last-known rows keep rendering (law 3: no error wall).
  await expect(page.getByTestId('alert-row')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('/alerts page lists the same sorted alerts', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  await stubAlerts(page, { alerts: STUB_ALERTS, stale: false })
  await page.goto('/alerts', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('alerts-page')).toBeVisible()
  const rows = page.getByTestId('alert-row')
  await expect(rows).toHaveCount(3, { timeout: 15_000 })
  await expect(rows.nth(0)).toContainText('Tornado Warning')
  await expect(rows.nth(1)).toContainText('Flood Warning')
  await expect(rows.nth(2)).toContainText('Heat Advisory')

  // Page mode: no map mounted -> town lines are inert text (documented).
  await expect(page.getByTestId('alert-row-fly')).toHaveCount(0)

  await page.screenshot({ path: path.join(SHOT_DIR, `alerts-page-${testInfo.project.name}.png`) })
  expect(errors).toEqual([])
})
