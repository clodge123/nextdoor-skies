// W5-FEED Gate 1 browser test — real app (root vite project served by
// scripts/e2e-serve.mjs) driven through /feed with mocked /api/posts (S2–S4
// contract shapes; no real API, no seeded fake data in the app).
//
// Harness pattern mirrors tests/badges.spec.ts: console-clean collector,
// deterministic fixtures, archived screenshots under docs/screenshots/W5/.
// Run ONLY via scripts/e2e-gate.sh (fleet browser law).
import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { mkdirSync } from 'node:fs'

const SHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots', 'W5')
const TOWN_SLUG = 'springfield-37.22--93.3'

const SESSION = JSON.stringify({
  nickname: 'jordan',
  townSlug: TOWN_SLUG,
  townName: 'Springfield',
})

/** Contract-shaped fixture posts (S2): one hot-pinned, one plain. */
function fixturePosts() {
  return [
    {
      id: 'p_hot',
      author: 'maria',
      town: TOWN_SLUG,
      text: 'storm cell moving in fast',
      snapshot: null,
      createdAt: '2026-10-21T10:00:00.000Z',
      reactions: { '👍': 3, '❤️': 1, '😂': 0 },
      myReaction: null,
      commentsCount: 2,
      hot: true,
    },
    {
      id: 'p_new',
      author: 'jordan',
      town: TOWN_SLUG,
      text: 'clear skies at dawn',
      snapshot: null,
      createdAt: '2026-10-21T12:00:00.000Z',
      reactions: { '👍': 0, '❤️': 0, '😂': 0 },
      myReaction: null,
      commentsCount: 0,
      hot: false,
    },
  ]
}

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

/** Mock the whole posts API surface; POST bodies echo contract responses. */
function mockPostsApi(page: Page, posts: ReturnType<typeof fixturePosts>): void {
  const comments: Record<string, Array<{ id: string; author: string; text: string; createdAt: string }>> = {
    p_hot: [
      { id: 'c_1', author: 'sam', text: 'how fast?', createdAt: '2026-10-21T10:30:00.000Z' },
      { id: 'c_2', author: 'lee', text: 'seen this before', createdAt: '2026-10-21T10:45:00.000Z' },
    ],
    p_new: [],
  }
  let nextCommentId = 100

  page.route('**/api/posts?**', async (route) => {
    const url = new URL(route.request().url())
    const pathQ = url.searchParams.get('path')
    if (pathQ) {
      // Query-param route form (the C6 fix shape): /api/posts?path=<id>/<action>
      const [id, action] = pathQ.split('/')
      if (action === 'comments') {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON() as { text: string }
          const comment = {
            id: `c_${nextCommentId++}`,
            author: 'jordan',
            text: body.text,
            createdAt: '2026-10-21T13:00:00.000Z',
          }
          ;(comments[id] ??= []).push(comment)
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(comment) })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(comments[id] ?? []),
        })
        return
      }
      if (action === 'reactions' && route.request().method() === 'POST') {
        const { emoji } = route.request().postDataJSON() as { emoji: '👍' | '❤️' | '😂' }
        const post = posts.find((p) => p.id === id)
        if (!post) {
          await route.fulfill({ status: 404, body: 'not found' })
          return
        }
        if (post.myReaction === emoji) {
          post.reactions[emoji] = Math.max(0, post.reactions[emoji] - 1)
          post.myReaction = null
        } else {
          if (post.myReaction) post.reactions[post.myReaction] = Math.max(0, post.reactions[post.myReaction] - 1)
          post.reactions[emoji] += 1
          post.myReaction = emoji
        }
        // Real server shape (api/posts.js): { ok, myReaction } — the client
        // reconciles this into the optimistic view.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, myReaction: post.myReaction }),
        })
        return
      }
      if (action === 'flag' && route.request().method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, flags: 1 }) })
        return
      }
      await route.fulfill({ status: 404, body: 'not found' })
      return
    }
    const town = url.searchParams.get('town')
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, body: 'method not allowed' })
      return
    }
    if (town !== TOWN_SLUG) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts }) })
  })

  // Legacy subpath routes must NOT be used by the client any more (C6). If a
  // stray subpath request appears, fail loudly (fulfill 404 like production).
  page.route('**/api/posts/*/comments**', (route) =>
    route.fulfill({ status: 404, body: JSON.stringify({ error: 'subpath routing removed (C6)' }) }),
  )
  page.route('**/api/posts/*/reactions**', (route) =>
    route.fulfill({ status: 404, body: JSON.stringify({ error: 'subpath routing removed (C6)' }) }),
  )

  page.route('**/api/posts', async (route) => {
    // POST /api/posts (create) — exact URL, no query string.
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { town: string; text: string }
      const post = {
        id: `p_created_${nextCommentId++}`,
        author: 'jordan',
        town: body.town,
        text: body.text,
        snapshot: null,
        createdAt: '2026-10-21T13:00:00.000Z',
        reactions: { '👍': 0, '❤️': 0, '😂': 0 },
        myReaction: null,
        commentsCount: 0,
        hot: false,
      }
      posts.push(post)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ post }) })
      return
    }
    await route.fallback()
  })
}

async function setup(page: Page, opts: { session?: boolean } = {}): Promise<string[]> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const errors = attachConsoleCollector(page)
  if (opts.session !== false) {
    await page.addInitScript(
      ([key, value]: string[]) => localStorage.setItem(key, value),
      ['nds-session', SESSION],
    )
  }
  return errors
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) })
}

test('feed renders hot-pinned then newest with real content', async ({ page }, testInfo) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('hot-pinned')).toBeVisible()
  await expect(page.getByTestId('post-p_hot')).toContainText('storm cell moving in fast')
  await expect(page.getByTestId('post-p_hot')).toContainText('maria')
  await expect(page.getByTestId('post-p_new')).toContainText('clear skies at dawn')

  // pinned section precedes the newest list in DOM order
  const cards = page.locator('[data-testid^="post-p_"]')
  await expect(cards.first()).toHaveAttribute('data-post-id', 'p_hot')

  // town context + sort controls discoverable first-click
  await expect(page.getByTestId('feed-town')).toContainText('Springfield')
  await expect(page.getByTestId('sort-hot')).toBeVisible()
  await expect(page.getByTestId('sort-new')).toBeVisible()

  await shot(page, `feed-render-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('sort toggle switches hot/new ordering', async ({ page }, testInfo) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-p_hot')).toBeVisible()

  await page.getByTestId('sort-new').click()
  const cards = page.locator('[data-testid^="post-p_"]')
  await expect(cards.first()).toHaveAttribute('data-post-id', 'p_new')
  await expect(page.getByTestId('hot-pinned')).toHaveCount(0)

  await shot(page, `feed-sort-new-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('reaction toggle: optimistic count + highlight', async ({ page }, testInfo) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-p_new')).toBeVisible()

  const button = page.getByTestId('react-p_new-👍')
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(button.locator('.feed-reaction-count')).toHaveText('1')

  // toggle off (same emoji twice removes it, S4)
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(button.locator('.feed-reaction-count')).toHaveText('0')

  await shot(page, `feed-reaction-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('reply flow: flat list + composer, one level', async ({ page }, testInfo) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-p_hot')).toBeVisible()

  await page.getByTestId('reply-toggle-p_hot').click()
  await expect(page.getByTestId('replies-p_hot')).toBeVisible()
  await expect(page.locator('[data-testid="reply-c_1"]')).toContainText('how fast?')
  await expect(page.locator('[data-testid="reply-c_2"]')).toContainText('seen this before')

  await page.getByTestId('reply-input-p_hot').fill('thanks for the heads up')
  await page.getByTestId('reply-send-p_hot').click()
  await expect(page.locator('[data-testid^="reply-c_"]').last()).toContainText('thanks for the heads up')

  await shot(page, `feed-reply-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('honest empty state when town has no posts', async ({ page }, testInfo) => {
  const errors = await setup(page)
  mockPostsApi(page, [])
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('feed-empty')).toContainText('No posts in Springfield yet.')
  await expect(page.getByTestId('feed-error')).toHaveCount(0)

  await shot(page, `feed-empty-${testInfo.project.name}`)
  expect(errors).toEqual([])
})

test('no session: identity picker gate, never a fake feed', async ({ page }, testInfo) => {
  const errors = await setup(page, { session: false })
  mockPostsApi(page, fixturePosts())
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('identity-picker')).toBeVisible()
  await page.getByTestId('identity-nickname').fill('jordan')
  // Town is a combobox (search + pick), not a plain field: type, pick the
  // first result, then save.
  await page.getByTestId('identity-town-search').fill('Springfield')
  await page.getByTestId('identity-town-option').first().click()
  await page.getByTestId('identity-save').click()

  // session saved -> feed loads (mocked API returns its posts)
  await expect(page.getByTestId('feed-page')).toBeVisible()
  await expect(page.getByTestId('feed-town')).toContainText('Springfield')

  await shot(page, `feed-identity-${testInfo.project.name}`)
  expect(errors).toEqual([])
})
