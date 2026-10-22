// W5 FeedPage tests: honest empty state, hot-pinned section, session gate,
// optimistic reaction toggle. fetchImpl seam = no real network; R17-safe.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    render(<FeedPage />)
    expect(screen.getByTestId('feed-no-session')).toBeInTheDocument()
    expect(screen.getByTestId('identity-picker')).toBeInTheDocument()
  })
})

describe('FeedPage honest states', () => {
  it('empty town renders the honest empty message', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: [] }))
    render(<FeedPage fetchImpl={fetchImpl} />)
    expect(await screen.findByTestId('feed-empty')).toHaveTextContent('No posts in Springfield yet.')
    expect(screen.queryByTestId('feed-error')).toBeNull()
  })

  it('failed fetch renders an honest error with retry, never fake posts', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ error: 'db down' }, 500))
    render(<FeedPage fetchImpl={fetchImpl} />)
    expect(await screen.findByTestId('feed-error')).toBeInTheDocument()
    expect(screen.getByTestId('feed-retry')).toBeInTheDocument()
    expect(screen.queryByTestId('feed-empty')).toBeNull()
  })

  it('renders hot-pinned section then newest list', async () => {
    setSession()
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ posts: SEED_POSTS }))
    render(<FeedPage fetchImpl={fetchImpl} />)
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
    render(<FeedPage fetchImpl={fetchImpl} />)
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
    render(<FeedPage fetchImpl={fetchImpl} />)
    await screen.findByTestId('post-p_hot')
    await fireEvent.click(screen.getByTestId('sort-new'))
    // new view: no separate pinned section, newest-first ordering
    expect(screen.queryByTestId('hot-pinned')).toBeNull()
    await screen.findByTestId('post-p_new')
    const cards = screen.getAllByTestId(/^post-p_/)
    expect(cards[0]).toHaveAttribute('data-post-id', 'p_new')
  })
})
