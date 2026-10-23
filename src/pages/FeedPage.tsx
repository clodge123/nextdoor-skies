// W5-FEED — real feed (docs/WAVE-2-CONTRACTS.md §S2–S4), W4-E1 ALL-FEED
// upgrade (docs/WAVE-4-BRAINSTORM.md S4): the plain /feed route is the
// GLOBAL stream — every town, Hot | Latest tabs. Latest is the all feed
// (newest-first across towns); Hot is the engagement-curated view (server
// score: comments*2 + reactions + recency decay). The selected tab lives in
// the URL (`?scope=latest` — src/lib/scope.ts), so deep links restore the
// tab and back/forward switch it. Town feeds (/t/<slug>/feed) keep the same
// tabs, scoped to that town. Every post row carries a town chip that opens
// that town's panel (`?panel=<slug>` on the map — src/lib/panel.ts).
//
// W4-C2 FEED-LOAD (session 2 laws 3+4): infinite scroll — an
// IntersectionObserver sentinel nears the viewport and appends the NEXT
// page (`page=` param, ≤3 pages in flight, per-page SWR cache keys,
// id-dedupe so appends never churn existing rows). A short page (<
// POSTS_PAGE_SIZE rows) is the honest END OF LIST: "You're all caught up",
// never fake rows. A keyboard-reachable Load-more button is the honest
// fallback where IntersectionObserver can't fire (and the deterministic
// test seam).
//
// Honest states (R19): loading / ready / empty ("Awaiting feed…" style,
// never fake rows) / error with retry. No session => global browsing is
// allowed (browsing is town-free); posting needs identity (inline picker).
// R17: clock/RNG-free — timestamps are opaque strings; sorts are stable
// (createdAt desc, tie-break by id).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  fetchPosts,
  getSession,
  partitionHot,
  POSTS_PAGE_SIZE,
  sortByNewest,
  type FetchLike,
  type Post,
  type Session,
} from '../lib/feed'
import { parseScope, scopeHref, type FeedScope } from '../lib/scope'
import { SkeletonFeed, postsCacheKey, readPostsCache, writePostsCache } from '../components/Skeleton'
import { FeedPostCard } from '../components/FeedPostCard'
import { FeedComposer } from '../components/FeedComposer'
import { IdentityPicker } from '../components/IdentityPicker'

export interface FeedPageProps {
  /** Injectable fetch seam (mirrors the weather refresher law); defaults to window.fetch. */
  fetchImpl?: FetchLike
  /**
   * W3-B1 ROUTING: when set (e.g. /t/<slug>/feed), the feed is seeded with
   * THIS town, not the session town. Session 2 law: town feeds deep-link
   * independently of identity; posting still uses the session identity.
   */
  townSlug?: string
  townName?: string
}

/** W4-C2 append dedupe (PURE): keep existing rows byte-identical (React
 *  keys stable — no re-render churn), drop rows already seen (a live list
 *  can straddle a page boundary), append the rest in server order. No
 *  sorting, no mutation, deterministic. Exported for unit tests. */
export function appendUnique(existing: readonly Post[], incoming: readonly Post[]): Post[] {
  const seen = new Set(existing.map((p) => p.id))
  const out: Post[] = [...existing]
  for (const post of incoming) {
    if (seen.has(post.id)) continue
    seen.add(post.id)
    out.push(post)
  }
  return out
}

export default function FeedPage({ fetchImpl, townSlug, townName: townNameProp }: FeedPageProps = {}) {
  const [session, setSession] = useState<Session | null>(() => getSession())
  const location = useLocation()
  const navigate = useNavigate()

  // The URL is the source of truth for the tab (deep link / back button).
  const scope: FeedScope = parseScope(location.search)
  const sort = scope === 'hot' ? 'hot' : 'new'

  const [posts, setPosts] = useState<Post[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')

  // W4-C2 INFINITE SCROLL state (session 2 law 4):
  // pagesRef = pages currently rendered; seenIdsRef = ids already shown
  // (append dedupe — the server pages a live list, so a boundary row can
  // legitimately repeat; keys stay stable, no churn). hasMore drives the
  // sentinel + end marker; ≤3 page requests in flight (MAX_PAGES_IN_FLIGHT).
  const pagesRef = useRef(1)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const inFlightRef = useRef(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Routing override: /t/<slug>/feed shows that town's feed regardless of
  // the session town. Plain /feed: Hot = session town when one exists
  // (existing W5 curation), Latest = the GLOBAL stream (W4-E1: all towns,
  // newest-first — "Latest IS the all feed", S4 brainstorm).
  const feedTown = townSlug ?? (scope === 'latest' ? '' : session?.townSlug ?? '')
  const globalFeed = !feedTown
  const townName = townSlug
    ? (townNameProp ?? townSlug)
    : globalFeed
      ? 'all towns'
      : (session?.townName ?? '')

  const load = useCallback(async () => {
    // W4-C1 cached-first (SWR law 3): last-good posts stay on screen while
    // revalidating; skeletons only when NOTHING is cached.
    // W4-C2: page 1 ONLY — appends ride appendNextPage, never this path.
    // Revalidation REPLACES page-1 rows (pages beyond 1 are dropped and
    // re-appended from cache, so a fresh view never mixes stale pages).
    const cacheKey = postsCacheKey(feedTown, sort, 1)
    const cached = readPostsCache(cacheKey)
    if (!cached) setStatus('loading')
    setError('')
    const res = await fetchPosts({ town: feedTown || undefined, sort, page: 1, fetchImpl })
    if (!res.ok && res.aborted) return // superseded: keep current state, no noise.
    if (res.ok) {
      writePostsCache(cacheKey, res.data)
      pagesRef.current = 1
      seenIdsRef.current = new Set(res.data.map((p) => p.id))
      setPosts(res.data)
      setHasMore(res.data.length >= POSTS_PAGE_SIZE)
      setMoreError('')
      setStatus('ready')
    } else if (!cached) {
      setPosts([])
      setError(res.error)
      setStatus('error')
    }
    // Cached + failed revalidation: last-good stays (weather last-data-wins
    // law) — the next window revalidates; never silently fabricate.
  }, [feedTown, sort, fetchImpl])

  useEffect(() => {
    let ignore = false
    const cacheKey = postsCacheKey(feedTown, sort, 1)
    const cached = readPostsCache(cacheKey)
    pagesRef.current = 1
    seenIdsRef.current = new Set((cached ?? []).map((p) => p.id))
    setHasMore(false)
    setMoreError('')
    setLoadingMore(false)
    if (cached) {
      setPosts(cached)
      setStatus('ready') // cached-first: show last-good NOW, revalidate below.
    } else {
      setStatus('loading')
    }
    setError('')
    void fetchPosts({ town: feedTown || undefined, sort, page: 1, fetchImpl }).then((res) => {
      if (ignore) return
      if (!res.ok && res.aborted) return // superseded by a newer request: keep state.
      if (res.ok) {
        writePostsCache(cacheKey, res.data)
        pagesRef.current = 1
        seenIdsRef.current = new Set(res.data.map((p) => p.id))
        setPosts(res.data)
        setHasMore(res.data.length >= POSTS_PAGE_SIZE)
        setStatus('ready')
      } else if (!cached) {
        setPosts([])
        setError(res.error)
        setStatus('error')
      }
    })
    return () => {
      ignore = true
    }
  }, [feedTown, sort, fetchImpl])

  // W4-C2 APPEND: fetch the NEXT page and append it. Rows already on
  // screen are dropped by id (the server pages a live, mutable list, so a
  // boundary row can straddle pages — dedupe keeps keys unique and React
  // never churns existing rows). A short page = END OF LIST (honest marker,
  // never fake rows). ≤3 page requests in flight (session 2 law 4).
  const appendNextPage = useCallback(async () => {
    if (status !== 'ready') return
    if (!hasMore || loadingMore) return
    if (inFlightRef.current >= 3) return
    const nextPage = pagesRef.current + 1
    const cacheKey = postsCacheKey(feedTown, sort, nextPage)
    const cached = readPostsCache(cacheKey)
    if (cached) {
      // Cached-first append: show the cached page NOW, no spinner.
      pagesRef.current = nextPage
      seenIdsRef.current = new Set([
        ...seenIdsRef.current,
        ...cached.map((p) => p.id),
      ])
      setPosts((prev) => appendUnique(prev, cached))
      setHasMore(cached.length >= POSTS_PAGE_SIZE)
      return
    }
    inFlightRef.current += 1
    setLoadingMore(true)
    setMoreError('')
    const res = await fetchPosts({
      town: feedTown || undefined,
      sort,
      page: nextPage,
      fetchImpl,
    })
    inFlightRef.current -= 1
    setLoadingMore(false)
    if (!res.ok) {
      if (!res.aborted) setMoreError(res.error) // superseded: silent, sentinel retries
      return
    }
    writePostsCache(cacheKey, res.data)
    pagesRef.current = nextPage
    seenIdsRef.current = new Set([
      ...seenIdsRef.current,
      ...res.data.map((p) => p.id),
    ])
    setPosts((prev) => appendUnique(prev, res.data))
    setHasMore(res.data.length >= POSTS_PAGE_SIZE)
  }, [feedTown, sort, fetchImpl, status, hasMore, loadingMore])

  // Keep the latest append closure for the observer (which must not
  // re-subscribe on every posts mutation).
  const appendRef = useRef(appendNextPage)
  appendRef.current = appendNextPage

  // IntersectionObserver sentinel: when it NEARS the viewport (800px
  // rootMargin — the "nears" law), append the next page. The Load-more
  // button is the honest keyboard fallback (and the deterministic seam).
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) void appendRef.current()
        }
      },
      { rootMargin: '800px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, posts.length, status])

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectScope = (next: FeedScope) => {
    navigate(scopeHref(location.pathname, location.search, next))
  }

  // W4-C2: one feed-footer bundle for both render branches (session-gate
  // branch + normal) — sentinel, load-more, end marker, append errors.
  const footer = {
    hasMore,
    loadingMore,
    moreError,
    onAppend: () => void appendNextPage(),
    sentinelRef,
  }

  // Keyboard law (R13): arrow keys move between tabs (activating on move —
  // the WAI-ARIA tabs pattern); Tab reaches both tabs as a group.
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = e.key === 'ArrowRight' ? 1 : 0
      tabRefs.current[next]?.focus()
      selectScope(next === 0 ? 'hot' : 'latest')
    }
  }

  if (!session && !feedTown) {
    // W4-E1: browsing the global stream needs NO session (town-free).
    // Posting does — the inline picker is the same identity surface the
    // old gate showed, now beside an honest, browsable feed.
    return (
      <section className="feed-page" aria-labelledby="feed-heading" data-testid="feed-page">
        <div className="feed-toolbar">
          <h1 id="feed-heading">Feed</h1>
          <span className="feed-town-context" data-testid="feed-town">
            All towns
          </span>
          <FeedTabs scope={scope} tabRefs={tabRefs} onKey={onTabKey} onSelect={selectScope} />
        </div>
        <p data-testid="feed-no-session">
          You're not in a town yet — pick a nickname and town to post. Browsing works below.
        </p>
        <IdentityPicker
          onSaved={(saved) => {
            setSession(saved)
          }}
        />
        <FeedList
          posts={posts}
          status={status}
          error={error}
          scope={scope}
          townName={townName}
          globalFeed={globalFeed}
          session={null}
          fetchImpl={fetchImpl}
          onRetry={() => void load()}
          footer={footer}
        />
      </section>
    )
  }

  return (
    <section className="feed-page" aria-labelledby="feed-heading" data-testid="feed-page">
      <div className="feed-toolbar">
        <h1 id="feed-heading">Feed</h1>
        <span className="feed-town-context" data-testid="feed-town">
          {globalFeed ? 'All towns' : townName}
        </span>
        <FeedTabs scope={scope} tabRefs={tabRefs} onKey={onTabKey} onSelect={selectScope} />
      </div>

      {session && (
        <FeedComposer session={session} fetchImpl={fetchImpl} onPosted={() => void load()} />
      )}

      <FeedList
        posts={posts}
        status={status}
        error={error}
        scope={scope}
        townName={townName}
        globalFeed={globalFeed}
        session={session}
        fetchImpl={fetchImpl}
        onRetry={() => void load()}
        footer={footer}
      />
    </section>
  )
}

/** Hot | Latest tabs — square geometry (C-02), neon-active (C-01), >=44px
 *  per tab (R13), role=tablist + arrow-key nav (keyboard-accessible). */
function FeedTabs({
  scope,
  tabRefs,
  onKey,
  onSelect,
}: {
  scope: FeedScope
  tabRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>
  onKey: (e: React.KeyboardEvent) => void
  onSelect: (scope: FeedScope) => void
}) {
  return (
    <div className="feed-tabs" role="tablist" aria-label="Feed view">
      <button
        type="button"
        role="tab"
        id="feed-tab-hot"
        aria-selected={scope === 'hot'}
        aria-controls="feed-list"
        data-testid="feed-tab-hot"
        data-scope="hot"
        ref={(el) => {
          tabRefs.current[0] = el
        }}
        className="feed-tab"
        data-active={scope === 'hot'}
        onKeyDown={(e) => onKey(e)}
        onClick={() => onSelect('hot')}
      >
        Hot
      </button>
      <button
        type="button"
        role="tab"
        id="feed-tab-latest"
        aria-selected={scope === 'latest'}
        aria-controls="feed-list"
        data-testid="feed-tab-latest"
        data-scope="latest"
        ref={(el) => {
          tabRefs.current[1] = el
        }}
        data-active={scope === 'latest'}
        onKeyDown={(e) => onKey(e)}
        onClick={() => onSelect('latest')}
      >
        Latest
      </button>
    </div>
  )
}

function FeedList({
  posts,
  status,
  error,
  scope,
  townName,
  globalFeed,
  session,
  fetchImpl,
  onRetry,
  footer,
}: {
  posts: Post[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  scope: FeedScope
  townName: string
  globalFeed: boolean
  session: Session | null
  fetchImpl?: FetchLike
  onRetry: () => void
  footer: {
    hasMore: boolean
    loadingMore: boolean
    moreError: string
    onAppend: () => void
    sentinelRef: React.MutableRefObject<HTMLDivElement | null>
  }
}) {
  const { pinned, rest } = partitionHot(posts)
  const newest = sortByNewest(posts)

  // W4-C2 feed footer — ONE place, both tabs. The sentinel is the
  // IntersectionObserver target; Load-more is the honest keyboard fallback
  // (≥44px, R13); the end marker is the honest END OF LIST (R19 — a real
  // signal, never fake rows).
  const listFooter = (
    <div className="feed-footer" data-testid="feed-footer">
      {footer.hasMore && (
        <div ref={footer.sentinelRef} className="feed-sentinel" data-testid="feed-sentinel" aria-hidden="true" />
      )}
      {footer.hasMore && !footer.loadingMore && (
        <button type="button" className="feed-load-more" data-testid="feed-load-more" onClick={footer.onAppend}>
          Load more
        </button>
      )}
      {footer.hasMore && footer.loadingMore && (
        <SkeletonFeed count={2} testId="feed-loading-more" />
      )}
      {footer.hasMore && footer.moreError && (
        <p className="feed-append-error" role="status" data-testid="feed-append-error" title={footer.moreError}>
          Couldn't load more posts —{' '}
          <button type="button" data-testid="feed-append-retry" onClick={footer.onAppend}>
            Try again
          </button>
        </p>
      )}
      {!footer.hasMore && posts.length > 0 && status === 'ready' && (
        <p className="feed-end-marker" data-testid="feed-end-marker">
          You're all caught up
        </p>
      )}
    </div>
  )

  return (
    <>
      {status === 'loading' && <SkeletonFeed />}

      {status === 'error' && (
        <div className="feed-error" role="alert" data-testid="feed-error" title={error}>
          Feed unavailable — {globalFeed ? 'all towns' : townName}
          <button type="button" data-testid="feed-retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && posts.length === 0 && (
        <p className="feed-empty" data-testid="feed-empty">
          {globalFeed
            ? 'Awaiting feed — no posts anywhere yet.'
            : `No posts in ${townName} yet.`}
        </p>
      )}

      {status === 'ready' && posts.length > 0 && (
        <div id="feed-list" role="tabpanel" aria-labelledby={scope === 'hot' ? 'feed-tab-hot' : 'feed-tab-latest'}>
          {scope === 'hot' ? (
            <>
              {pinned.length > 0 && (
                <section className="feed-section" aria-label="Hot right now" data-testid="hot-pinned">
                  <h2 className="feed-section-title">Hot right now</h2>
                  {pinned.map((post) => (
                    <FeedPostCard key={post.id} post={post} session={session} fetchImpl={fetchImpl} />
                  ))}
                </section>
              )}
              <section className="feed-section" aria-label="Newest" data-testid="newest-list">
                {rest.map((post) => (
                  <FeedPostCard key={post.id} post={post} session={session} fetchImpl={fetchImpl} />
                ))}
              </section>
            </>
          ) : (
            <section className="feed-section" aria-label="Newest" data-testid="newest-list">
              {newest.map((post) => (
                <FeedPostCard key={post.id} post={post} session={session} fetchImpl={fetchImpl} />
              ))}
            </section>
          )}
          {listFooter}
        </div>
      )}
    </>
  )
}
