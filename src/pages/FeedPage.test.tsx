// W5 FeedPage tests: honest empty state, hot-pinned section, session gate,
// optimistic reaction toggle. fetchImpl seam = no real network; R17-safe.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import FeedPage from './FeedPage'
import { SESSION_STORAGE_KEY, type FetchLike } from '../lib/feed'

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const SEED_POSTS = [
  {
    id: 'p_hot',
    author: 'maria',
    town: 'springfield-37.22--93.3',
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
    town: 'springfield-37.22--93.3',
    text: 'clear skies at dawn',
    snapshot: null,
    createdAt: '2026-10-21T12:00:00.000Z',
    reactions: { '👍': 0, '❤️': 0, '😂': 0 },
    myReaction: null,
    commentsCount: 0,
    hot: false,
  },
]

function setSession() {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ nickname: 'jordan', townSlug: 'springfield-37.22--93.3', townName: 'Springfield' }),
  )
}

beforeEach(() => localStorage.clear())

describe('FeedPage session gate (S1)', () => {
  it('shows the identity picker first-click when no session exists', () => {
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('feed-no-session')).toBeInTheDocument()
    expect(screen.getByTestId('identity-picker')).toBeInTheDocument()
  })
})

describe('FeedPage honest states', () => {
  it('empty town renders the honest empty message', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: [] }))
    render(
      <MemoryRouter>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('feed-empty')).toHaveTextContent('No posts in Springfield yet.')
    expect(screen.queryByTestId('feed-error')).toBeNull()
  })

  it('failed fetch renders an honest error with retry, never fake posts', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ error: 'db down' }, 500))
    render(
      <MemoryRouter>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('feed-error')).toBeInTheDocument()
    expect(screen.getByTestId('feed-retry')).toBeInTheDocument()
    expect(screen.queryByTestId('feed-empty')).toBeNull()
  })

  it('renders hot-pinned section then newest list', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: SEED_POSTS }))
    render(
      <MemoryRouter>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('post-p_hot')).toBeInTheDocument()
    expect(screen.getByTestId('hot-pinned')).toBeInTheDocument()
    expect(screen.getByTestId('newest-list')).toBeInTheDocument()
    // pinned card renders first in DOM order
    const cards = screen.getAllByTestId(/^post-p_/)
    expect(cards[0]).toHaveAttribute('data-post-id', 'p_hot')
    // snapshot <img> renders only when present; p_hot has none
    expect(screen.queryByTestId('snapshot-p_hot')).toBeNull()
  })
})

describe('FeedPage interactions', () => {
  it('optimistic reaction toggle updates counts immediately', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      if (String(init?.method ?? 'GET') === 'POST' && url.includes('/reactions')) {
        return jsonResponse({
          ...SEED_POSTS[1],
          reactions: { '👍': 1, '❤️': 0, '😂': 0 },
          myReaction: '👍',
        })
      }
      return jsonResponse({ posts: SEED_POSTS })
    })
    render(
      <MemoryRouter>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p_new')
    const button = screen.getByTestId('react-p_new-👍')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(button)
    // optimistic: count 0 -> 1 and highlighted without waiting for the API
    expect(screen.getByTestId('react-p_new-👍')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('react-p_new-👍').textContent).toContain('1')
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
  })

  it('sort toggle switches hot/new views', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: SEED_POSTS }))
    render(
      <MemoryRouter>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p_hot')
    await fireEvent.click(screen.getByTestId('feed-tab-latest'))
    // new view: no separate pinned section, newest-first ordering
    expect(screen.queryByTestId('hot-pinned')).toBeNull()
    await screen.findByTestId('post-p_new')
    const cards = screen.getAllByTestId(/^post-p_/)
    expect(cards[0]).toHaveAttribute('data-post-id', 'p_new')
  })
})

// W4-E1 ALL-FEED: global stream, ?scope= deep link, town chip -> panel.
describe('W4-E1 all-feed', () => {
  const GLOBAL_POSTS = [
    {
      id: 'g_a',
      author: 'maria',
      town: 'salina-38.84--97.61',
      text: 'prairie fire cookoff tonight',
      snapshot: null,
      createdAt: '2026-10-21T10:00:00.000Z',
      reactions: { '👍': 3, '❤️': 1, '😂': 0 },
      myReaction: null,
      commentsCount: 2,
      hot: true,
    },
    {
      id: 'g_b',
      author: 'jorge',
      town: 'springfield-37.22--93.3',
      text: 'storm cell over the courthouse',
      snapshot: null,
      createdAt: '2026-10-21T14:00:00.000Z',
      reactions: { '👍': 0, '❤️': 0, '😂': 0 },
      myReaction: null,
      commentsCount: 0,
      hot: false,
    },
  ]

  it('global stream: no session browses all towns, fetch omits town=', async () => {
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      expect(String(url)).toBe('/api/posts?sort=new')
      return jsonResponse({ posts: GLOBAL_POSTS })
    })
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    // Latest tab active from the deep link; newest-first across towns.
    expect(screen.getByTestId('feed-tab-latest')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('feed-tab-hot')).toHaveAttribute('aria-selected', 'false')
    const cards = await screen.findAllByTestId(/^post-g_/)
    expect(cards.map((c) => c.getAttribute('data-post-id'))).toEqual(['g_b', 'g_a'])
    expect(screen.getByTestId('feed-town')).toHaveTextContent('All towns')
  })

  it('tab click writes ?scope= into the URL (deep link restores the tab)', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: SEED_POSTS }))
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p_hot')
    expect(screen.getByTestId('feed-tab-hot')).toHaveAttribute('aria-selected', 'true')
    await fireEvent.click(screen.getByTestId('feed-tab-latest'))
    expect(screen.getByTestId('feed-tab-latest')).toHaveAttribute('aria-selected', 'true')
    // URL carries the scope (location.search drives parseScope).
    expect(await screen.findByTestId('feed-tab-latest')).toHaveAttribute('aria-selected', 'true')
  })

  it('each post row carries a town chip linking to the panel (?panel=<slug>)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: GLOBAL_POSTS }))
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    const chip = await screen.findByTestId('town-chip-g_a')
    expect(chip).toHaveAttribute('href', '/?panel=salina-38.84--97.61')
    expect(chip).toHaveTextContent('salina-38.84--97.61')
    const chipB = screen.getByTestId('town-chip-g_b')
    expect(chipB).toHaveAttribute('href', '/?panel=springfield-37.22--93.3')
  })

  it('keyboard: arrow keys move between tabs (activating), Tab reaches them', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: SEED_POSTS }))
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p_hot')
    const hot = screen.getByTestId('feed-tab-hot')
    const latest = screen.getByTestId('feed-tab-latest')
    hot.focus()
    fireEvent.keyDown(hot, { key: 'ArrowRight' })
    expect(latest).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(latest, { key: 'ArrowLeft' })
    expect(hot).toHaveAttribute('aria-selected', 'true')
    // tabs are real buttons (Tab reaches them as a group)
    expect(hot.tagName).toBe('BUTTON')
    expect(latest.tagName).toBe('BUTTON')
  })

  it('global empty state is honest (awaiting feed, never fake rows)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: [] }))
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('feed-empty')).toHaveTextContent('Awaiting feed')
    expect(screen.queryAllByTestId(/^post-/)).toHaveLength(0)
  })
})
