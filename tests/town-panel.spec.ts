// W3-B2 TOWN PANEL Gate 1 — real Chromium, production build served by
// scripts/e2e-serve.mjs. Clicking a town badge opens the in-map panel
// (desktop: right-docked slide-over; phone: bottom sheet), the URL carries
// `?panel=<slug>` (src/lib/panel.ts scheme), panel data is real (stubbed
// weather/alerts/posts payloads, asserted end-to-end), and every dismiss
// path works: close button, Esc, click-outside, back button, mobile drag.
//
// Console-clean collector per the L2 harness law (same documented maplibre
// exclusions as map.spec.ts / badges.spec.ts). Run ONLY via
// scripts/e2e-gate.sh (fleet browser law).
import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W3-B2')
const SALINA_SLUG = 'salina-38.84--97.61'
const WEATHER_URL = /\/api\/weather\?.*/
const ALERTS_URL = /\/api\/alerts\?.*/
const POSTS_URL = /\/api\/posts\?.*/
/** Salina center — zoom-9 viewports land on the town (badges.spec law). */
const SALINA_CENTER = '-97.6114,38.8403'

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

/** Node-side tile relay (host egress proxy strips CORS), map.spec.ts law. */
async function relayOfm(route: Route) {
  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(route.request().url())
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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function stubTownId(name: string, lat: number, lon: number): string {
  return `${slugify(name)}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`
}

let stubTowns: Array<{ name: string; lat: number; lon: number }> | null = null

/** Deterministic temps for every town in the requested bbox. */
function stubWeather(page: Page): void {
  void page.route(WEATHER_URL, async (route) => {
    if (!stubTowns) {
      stubTowns = JSON.parse(
        readFileSync(path.join(process.cwd(), 'data', 'towns', 'us-towns.json'), 'utf8'),
      ).towns
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

/** One Severe alert on Salina (panel alert-count + badge dot source). */
function stubAlerts(page: Page): void {
  void page.route(ALERTS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [
          { id: 'urn:oid:stub-salina-flood', event: 'Flood Warning', town: SALINA_SLUG, severity: 'Severe', expires: null },
        ],
        stale: false,
      }),
    })
  })
}

/** Two Salina posts (newest-first sort=new path), nothing for other towns. */
function stubPosts(page: Page): void {
  void page.route(POSTS_URL, async (route) => {
    const town = new URL(route.request().url()).searchParams.get('town')
    const posts =
      town === SALINA_SLUG
        ? [
            {
              id: 'p_panel_2', author: 'maria', town: SALINA_SLUG, text: 'prairie fire cookoff tonight',
              snapshot: null, createdAt: '2026-10-21T18:00:00.000Z',
              reactions: { '👍': 3, '❤️': 1, '😂': 0 }, myReaction: null, commentsCount: 2, hot: false,
            },
            {
              id: 'p_panel_1', author: 'jorge', town: SALINA_SLUG, text: 'grain elevator tour was great',
              snapshot: null, createdAt: '2026-10-21T09:30:00.000Z',
              reactions: { '👍': 1, '❤️': 0, '😂': 0 }, myReaction: null, commentsCount: 0, hot: false,
            },
          ]
        : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts }) })
  })
}

/** Tap on touch contexts, click elsewhere (R13: touch verified on mobile). */
async function tapOrClick(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  if (page.hasTouch) await locator.tap()
  else await locator.click()
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeather(page)
  stubAlerts(page)
  stubPosts(page)
  return errors
}

/** Land on Salina at zoom 3, then cross the zoom-9 badge gate (+3 x2). */
async function gotoSalinaZoomed(page: Page): Promise<void> {
  await page.goto(`/?ndsCenter=${SALINA_CENTER}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))
  await expect(page.locator('.town-badge').first()).toBeVisible({ timeout: 10_000 })
}

test('badge click opens the town panel with real data, URL carries ?panel', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await gotoSalinaZoomed(page)

  // The Salina badge is the clickable affordance (discoverability law).
  const badge = page.getByTestId(`town-badge-${SALINA_SLUG}`)
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await expect(badge).toHaveAttribute('data-panel', '1')
  await tapOrClick(page, badge)

  // Panel opens (slide-in) and the URL records the panel slug (B1-style
  // history: deep-linkable, back-button-closable).
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(new RegExp(`[?&]panel=${SALINA_SLUG.replace(/[.-]/g, '\\$&')}`))

  // Content law (session 2): name, temp, alert count, recent posts, links.
  await expect(page.getByRole('heading', { name: 'Salina' })).toBeVisible()
  await expect(page.getByTestId('town-panel-temp')).toContainText(/-?\d+°/)
  await expect(page.getByTestId('town-panel-alerts')).toContainText('1 active alert')
  await expect(page.getByTestId('town-panel-alerts')).toHaveAttribute('href', '/alerts')
  await expect(page.getByTestId('panel-post-p_panel_2')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('panel-post-p_panel_1')).toBeVisible()
  await expect(page.getByTestId('town-panel-see-all')).toHaveAttribute('href', `/t/${SALINA_SLUG}/feed`)
  await expect(page.getByTestId('town-panel-open')).toHaveAttribute('href', `/t/${SALINA_SLUG}`)

  // Desktop: right-docked ~360px slide-over. Phone: bottom sheet (<=480px).
  const box = await page.getByTestId('town-panel').boundingBox()
  expect(box).not.toBeNull()
  const vp = page.viewportSize()!
  if (vp.width > 480) {
    expect(box!.width).toBeLessThanOrEqual(361)
    expect(box!.x + box!.width).toBeGreaterThanOrEqual(vp.width - 1)
  } else {
    expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1)
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(vp.height - 1)
  }

  await page.screenshot({ path: path.join(SHOT_DIR, `panel-open-${testInfo.project.name}.png`) })

  // Dismiss via close button: panel gone, panel param cleaned from the URL.
  await tapOrClick(page, page.getByTestId('town-panel-close'))
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  await expect(page).not.toHaveURL(/panel=/)

  expect(errors).toEqual([])
})

test('Esc key dismisses the panel', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await page.goto(`/?ndsCenter=${SALINA_CENTER}&panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('click-outside dismisses the panel', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await page.goto(`/?ndsCenter=${SALINA_CENTER}&panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 30_000 })
  const vp = page.viewportSize()!
  // Click on the scrim, far from the panel box (desktop right / phone bottom).
  const x = vp.width > 480 ? Math.max(20, vp.width - 400) : Math.round(vp.width / 2)
  const y = vp.width > 480 ? Math.round(vp.height / 2) : 80
  await page.mouse.click(x, y)
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('back button closes the panel (history law)', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await gotoSalinaZoomed(page)
  const badge = page.getByTestId(`town-badge-${SALINA_SLUG}`)
  await expect(badge).toBeVisible({ timeout: 10_000 })
  await tapOrClick(page, badge)
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await page.goBack()
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  await expect(page.getByTestId('map-view')).toBeVisible({ timeout: 30_000 })
  expect(errors).toEqual([])
})

test('deep link /?panel=<slug> opens the panel on hard load', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await page.goto(`/?ndsCenter=${SALINA_CENTER}&panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Salina' })).toBeVisible()
  await expect(page.getByTestId('panel-post-p_panel_2')).toBeVisible({ timeout: 10_000 })
  expect(errors).toEqual([])
})

test('mobile drag-to-dismiss closes the bottom sheet', async ({ page }) => {
  test.skip(!!page.viewportSize() && page.viewportSize()!.width > 480, 'phone-only: bottom sheet drag')
  test.setTimeout(120_000)
  const errors = await setup(page)
  await page.goto(`/?ndsCenter=${SALINA_CENTER}&panel=${SALINA_SLUG}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 30_000 })
  const handle = page.getByTestId('town-panel-handle')
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 160, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})

// ---------------------------------------------------------------------------
// W3-B3 CLICK-TO-DETAIL (session 2 decision 4): every target clickable at
// every zoom. Town LABELS/dots below zoom 9 open the SAME panel via the
// accessible target overlay (src/components/TownLabelTargets.tsx); a badge's
// alert DOT goes straight to /alerts (deepest intent); Tab reaches badges at
// zoom >= 9 and Enter opens; Esc closes.
// ---------------------------------------------------------------------------

const WICHITA_SLUG = 'wichita-37.69--97.34'
const WICHITA_CENTER = '-97.3375,37.6922'

test('label click below zoom 9 opens the town panel (no dead zones)', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  // Land on Wichita, zoom once (3 -> 6): STATE band, Wichita gets a real
  // clickable/focusable target over its canvas label. No badge exists here.
  await page.goto(`/?ndsCenter=${WICHITA_CENTER}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('map-view').locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(
    () => (window as { ndsMap?: { isStyleLoaded?: () => boolean } }).ndsMap?.isStyleLoaded?.() === true,
    null,
    { timeout: 45_000 },
  )
  await tapOrClick(page, page.getByRole('button', { name: 'zoom in' }))

  const target = page.getByTestId(`town-target-${WICHITA_SLUG}`)
  await expect(target).toBeVisible({ timeout: 10_000 })
  await expect(target).toHaveAttribute('data-panel', '1')
  await expect(target).toHaveAttribute('aria-label', 'Open Wichita town panel')
  // R13: honest hit area (>=44px square).
  const box = await target.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)

  await tapOrClick(page, target)
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(new RegExp(`[?&]panel=${WICHITA_SLUG.replace(/[.-]/g, '\\$&')}`))
  await expect(page.getByRole('heading', { name: 'Wichita' })).toBeVisible()
  await page.screenshot({ path: path.join(SHOT_DIR, `label-click-${testInfo.project.name}.png`) })

  // Dismiss via Esc (existing law) — panel param cleaned from the URL.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  await expect(page).not.toHaveURL(/panel=/)
  expect(errors).toEqual([])
})

test('badge alert-dot click goes straight to /alerts (deepest intent)', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await gotoSalinaZoomed(page)
  const dot = page.getByTestId(`alert-dot-${SALINA_SLUG}`)
  await expect(dot).toBeVisible({ timeout: 10_000 })
  await expect(dot).toHaveAttribute('href', '/alerts')
  // R13: the dot's hit area (visual 12px + ::before) measures >=44px.
  const box = await dot.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width * box!.height).toBeGreaterThanOrEqual(12 * 12)

  await tapOrClick(page, dot)
  await page.screenshot({ path: path.join(SHOT_DIR, `dot-to-alerts-${testInfo.project.name}.png`) })
  await expect(page).toHaveURL(/\/alerts$/)
  await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 10_000 })
  expect(errors).toEqual([])
})

test('keyboard: Tab reaches badges at zoom >= 9, Enter opens, Esc closes', async ({ page }) => {
  test.setTimeout(150_000)
  const errors = await setup(page)
  await gotoSalinaZoomed(page)

  // Tab until a badge link (data-panel) takes focus. Badges are real
  // anchors now (the overlay dropped its aria-hidden lie), so keyboard
  // users reach them; cap the loop so a regression fails fast.
  let focusedBadge = false
  for (let i = 0; i < 40 && !focusedBadge; i++) {
    await page.keyboard.press('Tab')
    focusedBadge = await page.evaluate(() => {
      const el = document.activeElement as Element | null
      return el?.getAttribute('data-panel') === '1'
    })
  }
  expect(focusedBadge, 'Tab reached a town badge link').toBe(true)

  await page.keyboard.press('Enter')
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(new RegExp(`[?&]panel=${SALINA_SLUG.replace(/[.-]/g, '\\$&')}`))

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('town-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})
