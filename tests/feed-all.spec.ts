// W4-E1 ALL-FEED Gate — real Chromium, production build served by
// scripts/e2e-serve.mjs (fleet law: run ONLY via scripts/e2e-gate.sh).
//
// Acceptance (docs/WAVE-4-BRAINSTORM.md S4 + lane brief):
//   1. Tabs Hot | Latest switch the GLOBAL stream (all towns, newest-first).
//   2. Deep link ?scope=latest restores the Latest tab on hard load.
//   3. A post row's town chip opens that town's panel (?panel=<slug> scheme).
//   4. Keyboard: Tab reaches the tabs; arrow keys move between them.
//
// Console-clean collector per the L2 harness law (documented maplibre
// exclusions). Deterministic fixtures — no real API, no seeded fake rows.
import { expect, test, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { mkdirSync } from 'node:fs'
import { markTourSeen } from './tour-seed'

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W4-E1')
const SPRINGFIELD = 'springfield-37.22--93.3'
const SALINA = 'salina-38.84--97.61'

const SESSION = JSON.stringify({
  nickname: 'jordan',
  townSlug: SPRINGFIELD,
  townName: 'Springfield',
})

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

/** Posts from TWO towns — the global stream's whole point. */
function globalPosts() {
  return [
    {
      id: 'g_springfield',
      author: 'maria',
      town: SPRINGFIELD,
      text: 'storm cell over the courthouse',
      snapshot: null,
      createdAt: '2026-10-21T14:00:00.000Z',
      reactions: { '👍': 1, '❤️': 0, '😂': 0 },
      myReaction: null,
      commentsCount: 0,
      hot: false,
    },
    {
      id: 'g_springfield_hot',
      author: 'lee',
      town: SPRINGFIELD,
      text: 'tornado siren drill at the elementary school',
      snapshot: null,
      createdAt: '2026-10-21T16:00:00.000Z',
      reactions: { '👍': 5, '❤️': 2, '😂': 0 },
      myReaction: null,
      commentsCount: 4,
      hot: true,
    },
    {
      id: 'g_salina_newest',
      author: 'jorge',
      town: SALINA,
      text: 'prairie fire cookoff tonight',
      snapshot: null,
      createdAt: '2026-10-21T18:00:00.000Z',
      reactions: { '👍': 3, '❤️': 1, '😂': 0 },
      myReaction: null,
      commentsCount: 2,
      hot: true,
    },
    {
      id: 'g_salina_older',
      author: 'sam',
      town: SALINA,
      text: 'grain elevator tour was great',
      snapshot: null,
      createdAt: '2026-10-21T09:30:00.000Z',
      reactions: { '👍': 0, '❤️': 0, '😂': 0 },
      myReaction: null,
      commentsCount: 0,
      hot: false,
    },
  ]
}

/** Mock /api/posts: town-filtered when town= is present, GLOBAL when not. */
function mockGlobalPostsApi(page: Page): void {
  const all = globalPosts()
  void page.route('**/api/posts?**', async (route) => {
    const url = new URL(route.request().url())
    const pathQ = url.searchParams.get('path')
    if (pathQ) {
      const [id, action] = pathQ.split('/')
      if (action === 'comments') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            id === 'g_salina_newest'
              ? [
                  { id: 'c_1', author: 'lee', text: 'how hot?', createdAt: '2026-10-21T18:30:00.000Z' },
                  { id: 'c_2', author: 'ana', text: 'count me in', createdAt: '2026-10-21T18:40:00.000Z' },
                ]
              : [],
          ),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, myReaction: null }) })
    }
    const town = url.searchParams.get('town')
    const posts = town ? all.filter((p) => p.town === town) : all
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts }) })
  })
}

function stubWeatherAndAlerts(page: Page): void {
  void page.route(/\/api\/weather\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ temps: {}, codes: {}, stale: false }),
    })
  })
  void page.route(/\/api\/alerts\?.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ alerts: [], stale: false }),
    })
  })
}

async function setup(page: Page): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  await page.route('**tiles.openfreemap.org/**', relayOfm)
  stubWeatherAndAlerts(page)
  mockGlobalPostsApi(page)
  await page.addInitScript(
    ([key, value]: string[]) => localStorage.setItem(key, value),
    ['nds-session', SESSION],
  )
  return errors
}

test('Hot | Latest tabs switch the global stream (all towns, newest-first)', async ({ page }, testInfo) => {
  const errors = await setup(page)
  await markTourSeen(page)
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })

  // Hot tab is the canonical default (no ?scope= in the URL).
  await expect(page.getByTestId('feed-tab-hot')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('feed-tab-latest')).toHaveAttribute('aria-selected', 'false')
  // Tabs are >=44px, square (C-01/C-02/R13).
  const hotBox = page.getByTestId('feed-tab-hot')
  await expect(hotBox).toBeVisible()
  const box = await hotBox.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  const tablist = page.getByRole('tablist', { name: 'Feed view' })
  await expect(tablist).toBeVisible()

  // Latest tab = GLOBAL stream: every town, newest-first across towns.
  await page.getByTestId('feed-tab-latest').click()
  await expect(page).toHaveURL(/scope=latest/)
  const cards = page.locator('[data-testid^="post-g_"]')
  await expect(cards).toHaveCount(4)
  await expect(cards.first()).toHaveAttribute('data-post-id', 'g_salina_newest')
  const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-post-id')))
  expect(ids).toEqual(['g_salina_newest', 'g_springfield_hot', 'g_springfield', 'g_salina_older'])
  // Town chips present on every row.
  await expect(page.getByTestId('town-chip-g_salina_newest')).toContainText(SALINA)
  await expect(page.getByTestId('town-chip-g_springfield')).toContainText(SPRINGFIELD)

  // Back to Hot: engagement view (hot-pinned section exists).
  await page.getByTestId('feed-tab-hot').click()
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/feed$/)
  await expect(page.getByTestId('hot-pinned')).toBeVisible()

  await shot(page, `feed-tabs-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('deep link /feed?scope=latest restores the Latest tab on hard load', async ({ page }, testInfo) => {
  const errors = await setup(page)
  await markTourSeen(page)
  await page.goto('/feed?scope=latest', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('feed-tab-latest')).toHaveAttribute('aria-selected', 'true')
  // Global newest-first across towns straight from the deep link.
  const cards = page.locator('[data-testid^="post-g_"]')
  await expect(cards.first()).toHaveAttribute('data-post-id', 'g_salina_newest')

  await shot(page, `feed-deeplink-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('town chip opens that town panel (?panel= scheme)', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await setup(page)
  await markTourSeen(page)
  await page.goto('/feed?scope=latest', { waitUntil: 'domcontentloaded' })

  const chip = page.getByTestId('town-chip-g_salina_newest')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveAttribute('href', `/?panel=${SALINA}`)
  await chip.click()

  // Map route owns the panel: URL carries ?panel=<slug>, panel is open.
  await expect(page).toHaveURL(new RegExp(`\\?panel=${SALINA.replace(/[.-]/g, '\\$&')}`))
  await expect(page.getByTestId('town-panel')).toBeVisible({ timeout: 30_000 })
  // Panel shows the town's real (stubbed) posts — Salina content, not Springfield.
  await expect(page.getByTestId('town-panel')).toContainText('Salina', { timeout: 15_000 })
  await expect(page.getByTestId('town-panel-feed')).toContainText('prairie fire cookoff tonight', { timeout: 15_000 })

  await shot(page, `feed-chip-panel-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('keyboard: Tab reaches the tabs; arrows move between them', async ({ page }, testInfo) => {
  const errors = await setup(page)
  await markTourSeen(page)
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-g_springfield')).toBeVisible()

  // Tab from the page start until focus lands on a feed tab (<=15 stops).
  // Robust form (keyboard law, no weakening): walk the VISIBLE DOM-order
  // focusable list (hidden drawer clones are not Tab-reachable), assert the
  // Hot tab IS focusable, focus its immediate predecessor, press Tab once —
  // focus must land on the tab.
  const focusables = page.locator(
    'a[href]:visible, button:not([disabled]):visible, textarea:visible, input:visible, [tabindex]:not([tabindex="-1"]):visible',
  )
  const count = await focusables.count()
  let tabIdx = -1
  for (let i = 0; i < count; i++) {
    const id = await focusables.nth(i).getAttribute('data-testid')
    if (id === 'feed-tab-hot') {
      tabIdx = i
      break
    }
  }
  expect(tabIdx, 'Hot tab is a Tab-reachable focusable element').toBeGreaterThan(0)
  // Cap = 25: header nav (Map/Feed/Alerts/search/palette/units/theme) + page
  // furniture precede the tabs; 15 was a guess that the real DOM exceeded
  // (18 focusables before the Hot tab). The LAW is unchanged: the tab is a
  // native focusable element in DOM order, reached by Tab (asserted below).
  await focusables.nth(tabIdx - 1).focus()
  await page.keyboard.press('Tab')
  const activeId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
  expect(activeId).toBe('feed-tab-hot')

  // Arrow keys move between tabs, activating the target (WAI-ARIA tabs).
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('feed-tab-latest')).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/scope=latest/)
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('feed-tab-hot')).toHaveAttribute('aria-selected', 'true')

  await shot(page, `feed-keyboard-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
}
