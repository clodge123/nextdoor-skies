// W3-D3 POST DETAIL + LIGHTBOX + SHARE Gate — real app (root vite project
// served by scripts/e2e-serve.mjs), mocked posts API (contract shapes, same
// harness law as feed.spec.ts). Flow: feed -> view-post link -> /p/<id>
// renders full post + comments -> snapshot opens/closes the lightbox ->
// copy-link writes the real /p/<id> URL to the clipboard ('Copied!').
// Deep-link law: unknown id hard-loads the honest 404 page.
// Run ONLY via scripts/e2e-gate.sh (fleet browser law).
import { expect, test, type Page } from '@playwright/test'
import { markTourSeen } from './tour-seed';

const TOWN_SLUG = 'springfield-37.22--93.3'

const SESSION = JSON.stringify({
  nickname: 'jordan',
  townSlug: TOWN_SLUG,
  townName: 'Springfield',
})

// 1x1 transparent JPEG (base64) — deterministic snapshot fixture.
const SNAP = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='

function fixturePosts() {
  return [
    {
      id: 'p_hot',
      author: 'maria',
      town: TOWN_SLUG,
      text: 'storm cell moving in fast',
      snapshot: SNAP,
      createdAt: '2026-10-21T10:00:00.000Z',
      reactions: { '👍': 3, '❤️': 1, '😂': 0 },
      myReaction: null,
      commentsCount: 2,
      hot: true,
    },
  ]
}

function attachConsoleCollector(page: Page): string[] {
  const errors: string[] = []
  // Documented exclusion (routing.spec.ts law): the deep-link 404 test
  // INTENTIONALLY gets a 404 API response; the browser's resource-failure log
  // for that mocked endpoint is honest app behavior, not an app-origin error.
  const IGNORED = /Failed to load resource: the server responded with a status of 404/
  page.on('console', (msg) => {
    if (IGNORED.test(msg.text())) return
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

/** Contract-shaped posts API: list (town), single-post (?path=<id>),
 *  comments (?path=<id>/comments), reactions (?path=<id>/reactions). */
function mockPostsApi(page: Page, posts: ReturnType<typeof fixturePosts>): void {
  const comments: Record<string, Array<{ id: string; author: string; text: string; createdAt: string }>> = {
    p_hot: [
      { id: 'c_1', author: 'sam', text: 'how fast?', createdAt: '2026-10-21T10:30:00.000Z' },
      { id: 'c_2', author: 'lee', text: 'seen this before', createdAt: '2026-10-21T10:45:00.000Z' },
    ],
  }
  page.route('**/api/posts?**', async (route) => {
    const url = new URL(route.request().url())
    const pathQ = url.searchParams.get('path')
    if (pathQ) {
      const [id, action] = pathQ.split('/')
      const post = posts.find((p) => p.id === id)
      if (!action) {
        if (!post) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'post not found' }) })
          return
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ post }) })
        return
      }
      if (action === 'comments') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(comments[id] ?? []) })
        return
      }
      if (action === 'reactions' && route.request().method() === 'POST') {
        const { emoji } = route.request().postDataJSON() as { emoji: '👍' | '❤️' | '😂' }
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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, myReaction: post.myReaction }),
        })
        return
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
      return
    }
    const town = url.searchParams.get('town')
    const rows = town === TOWN_SLUG ? posts : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: rows }) })
  })
}

async function setup(page: Page): Promise<string[]> {
  const errors = attachConsoleCollector(page)
  await page.addInitScript(
    ([key, value]: string[]) => localStorage.setItem(key, value),
    ['nds-session', SESSION],
  )
  return errors
}

test('feed -> view post -> detail renders full post + comments', async ({ page }) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await markTourSeen(page);
  await page.goto('/feed', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-p_hot')).toBeVisible()

  // Discoverability: the card's author/stamp link goes to /p/<id>.
  await expect(page.getByTestId('view-post-p_hot')).toHaveAttribute('href', '/p/p_hot')
  await page.getByTestId('view-post-p_hot').click()

  await expect(page).toHaveURL(/\/p\/p_hot$/)
  await expect(page.getByTestId('post-detail-text')).toContainText('storm cell moving in fast')
  await expect(page.getByTestId('post-detail-stamp')).toContainText('2026-10-21 10:00')
  await expect(page.getByTestId('comment-c_1')).toContainText('how fast?')
  await expect(page.getByTestId('comment-c_2')).toContainText('seen this before')
  expect(errors).toEqual([])
})

test('detail snapshot opens the lightbox; Esc and scrim close it', async ({ page }) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await markTourSeen(page);
  await page.goto('/p/p_hot', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-detail-text')).toBeVisible()

  await page.getByTestId('snapshot-button-p_hot').click()
  const lightbox = page.getByTestId('lightbox')
  await expect(lightbox).toBeVisible()
  await expect(page.getByTestId('lightbox-image')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)

  // Re-open and close via scrim click (X button covered by vitest unit gate).
  await page.getByTestId('snapshot-button-p_hot').click()
  await expect(lightbox).toBeVisible()
  await lightbox.click({ position: { x: 5, y: 5 } })
  await expect(lightbox).toHaveCount(0)
  expect(errors).toEqual([])
})

test('copy-link writes the /p/<id> URL and shows Copied!', async ({ page, context }) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await markTourSeen(page);
  await page.goto('/p/p_hot', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('post-detail-text')).toBeVisible()

  // Clipboard API needs the permission grant on this exact origin (localhost).
  const origin = new URL(page.url()).origin
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })

  await page.getByTestId('share-copy').click()
  await expect(page.getByTestId('share-copied')).toBeVisible()

  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(/\/p\/p_hot$/)
  expect(errors).toEqual([])
})

test('deep-link unknown id -> honest 404 page', async ({ page }) => {
  const errors = await setup(page)
  mockPostsApi(page, fixturePosts())
  await markTourSeen(page);
  await page.goto('/p/p_ghost', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('not-found-page')).toBeVisible()
  expect(errors).toEqual([])
})
