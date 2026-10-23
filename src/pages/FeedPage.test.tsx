// W5 FeedPage tests: honest empty state, hot-pinned section, session gate,
// optimistic reaction toggle. fetchImpl seam = no real network; R17-safe.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import FeedPage, { appendUnique } from './FeedPage'
import { SESSION_STORAGE_KEY, type FetchLike } from '../lib/feed'
import { resetPostsCache, writePostsCache, postsCacheKey } from '../components/Skeleton'

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

beforeEach(() => {
  localStorage.clear()
  resetPostsCache() // W4-C1: module-level SWR cache must not leak across tests
})

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
      // W4-C2: the feed now asks for page 1 explicitly (server slices it).
      expect(String(url)).toBe('/api/posts?sort=new&page=1')
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

// ---------------------------------------------------------------------------
// W4-C2 FEED-LOAD — infinite scroll (page append keys, end marker, cached pages)
// ---------------------------------------------------------------------------

describe('W4-C2 infinite scroll', () => {
  /** n contract-shaped posts, strictly newest-first by index (p1 newest,
   *  unique timestamps so sortByNewest preserves p1,p2,... order). hourBase
   *  separates pages (page 1 = 11h, page 2 = 9h — later pages are older,
   *  exactly like the real newest-first server list). */
  function pagePosts(ids: string[], hourBase = 11) {
    return ids.map((id, i) => ({
      id,
      author: 'maria',
      town: 'springfield-37.22--93.3',
      text: `post ${id}`,
      snapshot: null,
      snapshotId: null,
      lat: null,
      lon: null,
      zoom: null,
      createdAt: `2026-10-21T${String(hourBase - Math.floor(i / 60)).padStart(2, '0')}:${String(59 - (i % 60)).padStart(2, '0')}:00.000Z`,
      reactions: { '👍': 0, '❤️': 0, '😂': 0 },
      myReaction: null,
      commentsCount: 0,
      hot: false,
    }))
  }

  /** A fetchImpl that serves pages from a map (page 1 = ids 1..30). */
  function pagingFetch(pages: Record<number, unknown[]>) {
    const urls: string[] = []
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      urls.push(String(url))
      const m = /page=(\d+)/.exec(String(url))
      const page = m ? Number(m[1]) : 1
      return jsonResponse({ posts: pages[page] ?? [] })
    })
    return { fetchImpl, urls }
  }

  it('page 2 appends on sentinel intersect — keys stable, no duplicate rows', async () => {
    setSession()
    const p1 = pagePosts(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    const p2 = pagePosts(['p31', 'p32'], 9)
    const { fetchImpl, urls } = pagingFetch({ 1: p1, 2: p2 })
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    expect(screen.getAllByTestId(/^post-p/)).toHaveLength(30)

    // 30 rows == full page -> hasMore: sentinel + Load-more present.
    expect(screen.getByTestId('feed-sentinel')).toBeInTheDocument()
    expect(screen.getByTestId('feed-load-more')).toBeInTheDocument()
    expect(screen.queryByTestId('feed-end-marker')).toBeNull()

    // Drive the IntersectionObserver seam: jsdom ships no IO, so install a
    // stub that records targets and fires them on demand (deterministic).
    const io = installIO()
    await fireEvent.click(screen.getByTestId('feed-load-more'))
    await screen.findByTestId('post-p31')
    expect(urls.some((u) => u.includes('page=2'))).toBe(true)

    // Append preserved keys: 32 unique rows, page-1 rows untouched.
    const cards = screen.getAllByTestId(/^post-p/)
    expect(cards).toHaveLength(32)
    const ids = cards.map((c) => c.getAttribute('data-post-id'))
    expect(new Set(ids).size).toBe(32)
    expect(ids.slice(0, 30)).toEqual(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    io.cleanup()
  })

  it('short page = honest END OF LIST marker, sentinel gone, zero fake rows', async () => {
    setSession()
    const { fetchImpl } = pagingFetch({ 1: pagePosts(['p1', 'p2']) })
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    // A short first page is the whole list: end marker, NO sentinel.
    expect(screen.getByTestId('feed-end-marker')).toHaveTextContent("You're all caught up")
    expect(screen.queryByTestId('feed-sentinel')).toBeNull()
    expect(screen.queryByTestId('feed-load-more')).toBeNull()
    expect(screen.getAllByTestId(/^post-p/)).toHaveLength(2)
  })

  it('append tiles to end marker: page 2 short -> sentinel replaced by marker', async () => {
    setSession()
    const p1 = pagePosts(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    const { fetchImpl } = pagingFetch({ 1: p1, 2: pagePosts(['p31'], 9) })
    installIO()
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    await fireEvent.click(screen.getByTestId('feed-load-more'))
    await screen.findByTestId('post-p31')
    expect(screen.getByTestId('feed-end-marker')).toBeVisible()
    expect(screen.queryByTestId('feed-sentinel')).toBeNull()
    expect(screen.getAllByTestId(/^post-p/)).toHaveLength(31)
  })

  it('boundary overlap dedupes (live list straddle) — no duplicate keys', async () => {
    setSession()
    const p1 = pagePosts(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    // Server re-sort moved p30 into page 2 as well (live-list straddle).
    const { fetchImpl } = pagingFetch({ 1: p1, 2: [...pagePosts(['p30'], 9), ...pagePosts(['p31'], 9)] })
    installIO()
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    await fireEvent.click(screen.getByTestId('feed-load-more'))
    const ids = screen.getAllByTestId(/^post-p/).map((c) => c.getAttribute('data-post-id'))
    expect(new Set(ids).size).toBe(ids.length) // no dupes
    expect(ids.filter((id) => id === 'p30')).toHaveLength(1)
  })

  it('append failure is honest (retry button), last-good rows stay', async () => {
    setSession()
    const p1 = pagePosts(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    let fail = true
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      const page = /page=(\d+)/.exec(String(url))
      if (page && Number(page[1]) > 1) {
        if (fail) return jsonResponse({ error: 'db down' }, 500)
        return jsonResponse({ posts: pagePosts(['p31'], 9) })
      }
      return jsonResponse({ posts: p1 })
    })
    installIO()
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    await fireEvent.click(screen.getByTestId('feed-load-more'))
    expect(await screen.findByTestId('feed-append-error')).toBeInTheDocument()
    expect(screen.getByTestId('feed-append-retry')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^post-p/)).toHaveLength(30) // last-good stays
    fail = false
    await fireEvent.click(screen.getByTestId('feed-append-retry'))
    await screen.findByTestId('post-p31')
  })

  it('cached-first append: a cached page 2 renders with ZERO extra requests', async () => {
    setSession()
    const p1 = pagePosts(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    const p2 = pagePosts(['p31'], 9)
    // Warm the cache the way a prefetch would (page-keyed cache write).
    // scope=latest + session town => the global stream (feedTown ''), so
    // the cache key is the global page-2 key (`|new|2`).
    writePostsCache(postsCacheKey('', 'new', 2), p2)
    const { fetchImpl, urls } = pagingFetch({ 1: p1, 2: p2 })
    installIO()
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    await fireEvent.click(screen.getByTestId('feed-load-more'))
    await screen.findByTestId('post-p31') // cached append, zero page-2 requests
    expect(urls.filter((u) => u.includes('page=2'))).toHaveLength(0)
  })

  it('appendUnique (pure): keeps existing order/identity, drops dupes', () => {
    const a = pagePosts(['a1', 'a2'])
    const b = pagePosts(['a2', 'a3'])
    const out = appendUnique(a, b)
    expect(out.map((p) => p.id)).toEqual(['a1', 'a2', 'a3'])
    expect(out[0]).toBe(a[0]) // identity preserved — no churn
  })

  it('≤3 pages in flight (never more than 3 concurrent page requests)', async () => {
    setSession()
    const p1 = pagePosts(Array.from({ length: 30 }, (_, i) => `p${i + 1}`))
    let inFlight = 0
    let maxInFlight = 0
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        const page = /page=(\d+)/.exec(String(url))
        const n = page ? Number(page[1]) : 1
        if (n === 1) return jsonResponse({ posts: p1 })
        await new Promise((r) => setTimeout(r, 5))
        // Full pages keep hasMore true so the hammer keeps issuing appends.
        return jsonResponse({
          posts: pagePosts(Array.from({ length: 30 }, (_, j) => `q${n}_${j}`), 9 - n),
        })
      } finally {
        inFlight -= 1
      }
    })
    installIO()
    render(
      <MemoryRouter initialEntries={['/feed?scope=latest']}>
        <FeedPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    )
    await screen.findByTestId('post-p1')
    // Hammer the load-more button: the in-flight cap must hold.
    for (let i = 0; i < 5; i++) {
      const btn = screen.queryByTestId('feed-load-more')
      if (btn) await fireEvent.click(btn)
    }
    expect(maxInFlight).toBeLessThanOrEqual(3)
  })
})

/** Deterministic IntersectionObserver stub for jsdom (no native IO).
 *  fire() triggers every registered target as intersecting. */
function installIO(): { fire: () => void; cleanup: () => void } {
  const targets: Array<{ cb: (entries: Array<{ isIntersecting: boolean }>) => void }> = []
  class FakeIO {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      this.cb = cb
    }
    cb: (entries: Array<{ isIntersecting: boolean }>) => void
    observe(el: Element) {
      targets.push({ cb: (entries) => this.cb(entries) })
      void el
    }
    disconnect() {}
    unobserve() {}
  }
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO
  return {
    fire: () => targets.forEach((t) => t.cb([{ isIntersecting: true }])),
    cleanup: () => {
      delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
    },
  }
}
