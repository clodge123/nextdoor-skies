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
  sortByNewest,
  type FetchLike,
  type Post,
  type Session,
} from '../lib/feed'
import { parseScope, scopeHref, type FeedScope } from '../lib/scope'
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
    setStatus('loading')
    setError('')
    const res = await fetchPosts({ town: feedTown || undefined, sort, fetchImpl })
    if (res.ok) {
      setPosts(res.data)
      setStatus('ready')
    } else {
      setPosts([])
      setError(res.error)
      setStatus('error')
    }
  }, [feedTown, sort, fetchImpl])

  useEffect(() => {
    let ignore = false
    setStatus('loading')
    setError('')
    void fetchPosts({ town: feedTown || undefined, sort, fetchImpl }).then((res) => {
      if (ignore) return
      if (res.ok) {
        setPosts(res.data)
        setStatus('ready')
      } else {
        setPosts([])
        setError(res.error)
        setStatus('error')
      }
    })
    return () => {
      ignore = true
    }
  }, [feedTown, sort, fetchImpl])

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectScope = (next: FeedScope) => {
    navigate(scopeHref(location.pathname, location.search, next))
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
}) {
  const { pinned, rest } = partitionHot(posts)
  const newest = sortByNewest(posts)

  return (
    <>
      {status === 'loading' && (
        <p className="feed-status" data-testid="feed-loading">
          Loading {globalFeed ? 'the global feed' : `${townName} feed`}…
        </p>
      )}

      {status === 'error' && (
        <p className="feed-error" role="alert" data-testid="feed-error">
          Couldn't load the feed ({error}).{' '}
          <button type="button" data-testid="feed-retry" onClick={onRetry}>
            Retry
          </button>
        </p>
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
        </div>
      )}
    </>
  )
}
