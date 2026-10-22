// W3-D1 REAL-API GATE (C6 law) — full round-trip against the ACTUAL api/*.js
// handlers served by scripts/api-serve.mjs. Zero mocked routes: every request
// travels the same URL shape production serves (`/api/posts?path=<id>/<action>`),
// so the class of bug that shipped the production reaction 404
// (docs/WAVE-3-CRITIQUE-TRIAGE.md C6) cannot hide behind a page.route mock.
//
// GATED: runs only when REAL_API=1 (see playwright.config.ts webServer).
// Run:  REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/real-api.spec.ts
//
// Round-trip: create post -> react 👍 -> GET shows reaction -> comment ->
// flag. Determinism (R17): no Math.random / Date.now in assertions; unique
// text is derived from the test title.
import { expect, test } from '@playwright/test'
import { markTourSeen } from './tour-seed';

const API_PORT = Number(process.env.E2E_API_PORT ?? 43118)
const API = `http://127.0.0.1:${API_PORT}`
const TOWN_SLUG = 'springfield-37.22--93.3'
const SESSION = JSON.stringify({
  nickname: 'jordan',
  townSlug: TOWN_SLUG,
  townName: 'Springfield',
})

test.describe('real API round-trip (no mocks)', () => {
  test.skip(!process.env.REAL_API, 'gated: set REAL_API=1 to run')

  test('create -> react -> list -> comment -> flag', async ({ request }) => {
    const sessionHeaders = {
      'content-type': 'application/json',
      'x-nds-session': SESSION,
    }

    // 1. CREATE — POST /api/posts (exact route; 201 + contract-shaped post).
    const created = await request.post(`${API}/api/posts`, {
      headers: sessionHeaders,
      data: { town: TOWN_SLUG, text: 'real api round-trip post' },
    })
    expect(created.status()).toBe(201)
    const post = (await created.json()).post
    expect(post.id).toMatch(/^p_[0-9a-z]+$/)
    expect(post.author).toBe('jordan')
    expect(post.reactions).toEqual({ '👍': 0, '❤️': 0, '😂': 0 })

    // 2. REACT — query-param route (the C6 fix form), server-side toggle.
    const reacted = await request.post(`${API}/api/posts`, {
      params: { path: `${post.id}/reactions` },
      headers: sessionHeaders,
      data: { emoji: '👍' },
    })
    expect(reacted.status()).toBe(200)
    expect((await reacted.json()).myReaction).toBe('👍')

    // 3. LIST — GET shows the reaction + myReaction on the row.
    const listed = await request.get(`${API}/api/posts`, {
      params: { town: TOWN_SLUG, sort: 'new' },
      headers: { 'x-nds-session': SESSION },
    })
    expect(listed.status()).toBe(200)
    const rows = (await listed.json()).posts.filter((p: { id: string }) => p.id === post.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].reactions['👍']).toBe(1)
    expect(rows[0].myReaction).toBe('👍')

    // 4. COMMENT — POST then GET through the same query-param route.
    const commented = await request.post(`${API}/api/posts`, {
      params: { path: `${post.id}/comments` },
      headers: sessionHeaders,
      data: { text: 'real api comment' },
    })
    expect(commented.status()).toBe(201)
    const comments = await request.get(`${API}/api/posts`, {
      params: { path: `${post.id}/comments` },
    })
    expect(comments.status()).toBe(200)
    expect((await comments.json()).some((c: { text: string }) => c.text === 'real api comment')).toBe(true)

    // 5. FLAG — POST /flag route answers 200 (hidden after 3 distinct flags).
    const flagged = await request.post(`${API}/api/posts`, {
      params: { path: `${post.id}/flag` },
      headers: sessionHeaders,
      data: {},
    })
    expect(flagged.status()).toBe(200)

    // 6. NEGATIVE CONTROL — the old subpath form must NOT be treated as an
    //    API route here (mirrors the production 404 that the fix removes).
    const subpath = await request.post(`${API}/api/posts/${post.id}/reactions`, {
      headers: sessionHeaders,
      data: { emoji: '👍' },
    })
    expect([404, 405]).toContain(subpath.status())
  })

  test('browser feed page drives the real API end-to-end', async ({ page }, testInfo) => {
    const sessionHeaders = {
      'content-type': 'application/json',
      'x-nds-session': SESSION,
    }
    // Deterministic per-project text (R17: no RNG/clock): api-serve shares one
    // in-memory db across viewport projects, so a constant seed text would
    // match multiple posts after the first project ran (strict-mode flake).
    const seedText = `browser round-trip post (${testInfo.project.name})`
    // Seed one post node-side so the page has real content to render.
    const created = await page.request.post(`${API}/api/posts`, {
      headers: sessionHeaders,
      data: { town: TOWN_SLUG, text: seedText },
    })
    expect(created.ok()).toBe(true)
    const postId = (await created.json()).post.id as string

    await page.addInitScript(
      ([key, value]: string[]) => localStorage.setItem(key, value),
      ['nds-session', SESSION],
    )
    // W3-E2: returning-visitor seed so the first-visit tour never overlays.
    await markTourSeen(page);
    await page.goto(`${API}/feed`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('feed-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(seedText)).toBeVisible({ timeout: 10_000 })

    // React through the UI: optimistic count, server truth, no console errors.
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))

    const reactBtn = page.getByTestId(`react-${postId}-👍`)
    await expect(reactBtn).toBeVisible({ timeout: 10_000 })
    await reactBtn.click()
    await expect(reactBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })
    await expect(reactBtn.locator('.feed-reaction-count')).toHaveText('1')

    // Server is the source of truth: the list refetch shows the reaction.
    const listed = await page.request.get(`${API}/api/posts`, {
      params: { town: TOWN_SLUG, sort: 'new' },
      headers: { 'x-nds-session': SESSION },
    })
    const rows = (await listed.json()).posts.filter(
      (p: { id: string }) => p.id === postId,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].reactions['👍']).toBeGreaterThanOrEqual(1)
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([])
  })
})
