// W3-F QA HARNESS — "click-every-button" pass expressed as CI Playwright
// tests (wave-3 brainstorm session 5 law: production-shaped, NO mocked
// routes — C6). Runs against scripts/api-serve.mjs (REAL_API=1 webServer in
// playwright.config.ts): built dist + the ACTUAL api/*.js handlers, SPA
// rewrite mirroring vercel.json. Zero page.route mocks anywhere.
//
// What each viewport project (phone/tablet/desktop) proves:
//   1. click sweep: every interactive element on /, /feed, /t/<slug>,
//      /t/<slug>/feed, /p/<id>, /alerts gets clicked; zero app-origin
//      console errors, zero failed /api requests, zero pageerrors.
//   2. keyboard pass: Tab order reaches header controls + main content,
//      Enter activates (nav link navigates; on phone the drawer button is
//      the keyboard-reachable header control), no keyboard traps.
//
// Run (fleet browser law — ALWAYS through the gate):
//   REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/qa.spec.ts
// QA=1 mode of scripts/e2e-gate.sh runs exactly this.
import { expect, test } from '@playwright/test'
import {
  attachCollectors,
  qaRoutes,
  sweepRoute,
  QA_TOWN_SLUG,
  QA_SESSION,
} from '../scripts/qa-harness.mjs'

const API_PORT = Number(process.env.E2E_API_PORT ?? 43118)
const BASE = `http://127.0.0.1:${API_PORT}`

test.describe('QA click-every-button pass (production-shaped, no mocks)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 (real api-serve harness)')

  let postId = ''

  test.beforeAll(async ({ request }) => {
    // Seed one REAL post node-side through the real API (no mocks) so the
    // /p/<id> route is a live deep link, not a placeholder.
    const created = await request.post(`${BASE}/api/posts`, {
      headers: { 'content-type': 'application/json', 'x-nds-session': QA_SESSION },
      data: { town: QA_TOWN_SLUG, text: 'qa spec seed post' },
    })
    expect(created.ok()).toBe(true)
    postId = (await created.json()).post.id
  })

  // Static route table for the test titles; the /p/ row resolves to the
  // seeded post id at run time (in-memory db shared across projects).
  const titles = qaRoutes(QA_TOWN_SLUG, 'POSTID')

  for (const route of titles) {
    test(`click sweep ${route.path}`, async ({ page }) => {
      // A full sweep of a live app (map label targets re-render per zoom,
      // SPA back-navigations, phone map load) needs generous time.
      test.setTimeout(180_000)
      const bag = attachCollectors(page)
      const resolved = qaRoutes(QA_TOWN_SLUG, postId).find((r) => r.label === route.label)!
      const row = await sweepRoute(page, BASE, resolved, bag, { maxClicks: 25 })
      // failures=0 semantics: ANY collector hit fails the route.
      expect(row.consoleErrors, `console errors on ${resolved.path}:\n${row.consoleErrors.join('\n')}`).toEqual([])
      expect(row.apiFailures, `api failures on ${resolved.path}:\n${row.apiFailures.join('\n')}`).toEqual([])
      expect(row.pageErrors, `pageerrors on ${resolved.path}:\n${row.pageErrors.join('\n')}`).toEqual([])
      expect(row.clicks, `enumeration gap: zero interactive elements on ${resolved.path}`).toBeGreaterThan(0)
    })
  }
})

test.describe('QA keyboard pass (no traps, Enter activates)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 (real api-serve harness)')

  for (const path of ['/', '/feed', '/alerts']) {
    test(`Tab order + Enter activation on ${path}`, async ({ page }, testInfo) => {
      test.setTimeout(60_000)
      const bag = attachCollectors(page)
      const phone = testInfo.project.name === 'phone'
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      // First VISIBLE header control (the hamburger is hidden >480px —
      // `.first()` alone resolves to hidden elements on tablet/desktop).
      await page.locator('header a, header button').locator('visible=true').first().waitFor({ timeout: 15_000 })

      // Tab the first screenful: focus must MOVE (no trap) and reach a
      // header control (.app-header) + main content. On phone the inline
      // nav is CSS-hidden (<=480px) — the hamburger is the keyboard-
      // reachable header control there, and the drawer carries the nav.
      let sawHeader = false
      let sawMain = false
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab')
        const cls = await page
          .locator(':focus')
          .evaluate((n) => ({
            header: !!n.closest('.app-header'),
            main: !!n.closest('main'),
          }))
          .catch(() => null)
        if (!cls) continue
        if (cls.header) sawHeader = true
        if (cls.main) sawMain = true
        if (sawHeader && sawMain) break
      }
      expect(sawHeader, `Tab never reached header controls on ${path}`).toBe(true)
      // Main-content reachability is vacuous ONLY when main has zero
      // focusable elements (e.g. phone /alerts with an empty alert list) —
      // the census is explicit, never silent.
      if (!sawMain) {
        const focusablesInMain = await page.locator('main a, main button, main input, main textarea, main [role="button"]').count()
        expect(focusablesInMain, `Tab never reached main content on ${path}`).toBe(0)
      }

      // Enter activates the focused control (the canonical keyboard law).
      if (phone) {
        // Phone surface: the hamburger is header-focusable; Enter opens the
        // drawer, whose Map link then Enter-navigates to /.
        const burger = page.getByTestId('nav-menu-button')
        await burger.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('nav-drawer')).toHaveAttribute('data-open', 'true', { timeout: 8_000 })
        // Pick a drawer link that actually CHANGES the route (Map -> / is a
        // no-op when we're already on /).
        const target = await page.evaluate(() => {
          const cur = location.pathname
          const links = [...document.querySelectorAll('#nav-drawer a')]
          const t = links.find((a) => {
            try {
              return new URL((a as HTMLAnchorElement).href).pathname !== cur
            } catch {
              return false
            }
          })
          if (!t) return null
          ;(t as HTMLElement).focus()
          return t.getAttribute('href')
        })
        expect(target, `no cross-route drawer link to activate on ${path}`).not.toBeNull()
        const urlBefore = page.url()
        await page.keyboard.press('Enter')
        await expect.poll(() => page.url(), { timeout: 8_000 }).not.toBe(urlBefore)
      } else {
        const target = await page.evaluate(() => {
          const cur = location.pathname
          const links = [...document.querySelectorAll('.app-nav a')]
          const t = links.find((a) => {
            try {
              return new URL((a as HTMLAnchorElement).href).pathname !== cur
            } catch {
              return false
            }
          })
          if (!t) return null
          ;(t as HTMLElement).focus()
          return t.getAttribute('href')
        })
        expect(target, `no cross-route nav link to activate on ${path}`).not.toBeNull()
        const urlBefore = page.url()
        await page.keyboard.press('Enter')
        await expect.poll(() => page.url(), { timeout: 8_000 }).not.toBe(urlBefore)
      }

      // No keyboard trap: Ctrl+K opens the palette, Escape closes it, Tab
      // lands focus on a real control (never pinned to <body>).
      await page.keyboard.press('Control+k')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Tab')
      const f2 = await page.evaluate(() => document.activeElement?.tagName ?? '')
      expect(f2, 'focus vanished (keyboard trap)').not.toBe('')
      expect(f2, 'focus pinned to body (trap)').not.toBe('BODY')

      expect(bag.consoleErrors, bag.consoleErrors.join('\n')).toEqual([])
      expect(bag.apiFailures, bag.apiFailures.join('\n')).toEqual([])
      expect(bag.pageErrors, bag.pageErrors.join('\n')).toEqual([])
    })
  }

  test('map controls reachable + Enter activates zoom', async ({ page }) => {
    test.setTimeout(60_000)
    const bag = attachCollectors(page)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const zoomIn = page.getByRole('button', { name: 'zoom in' })
    await expect(zoomIn).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'zoom out' })).toBeVisible()
    // Enter activation on a map control (keyboard law): zoom-in fires.
    await zoomIn.focus()
    const z0 = await page.evaluate(() => (window as { ndsMap?: { getZoom(): number } }).ndsMap?.getZoom() ?? -1)
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      (z) => (window as { ndsMap?: { getZoom(): number } }).ndsMap?.getZoom() !== z,
      z0,
      { timeout: 15_000 },
    )
    expect(bag.apiFailures.join('\n')).toEqual('')
  })
})
