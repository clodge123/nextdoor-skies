// W5-FEED — real per-town feed (docs/WAVE-2-CONTRACTS.md §S2–S4).
// Reads the session town (S1 shape via lib/feed.getSession — null degrades
// to the IdentityPicker gate, never a fake feed). Hot view = server-pinned
// cards first, newest follows; new view = pure ISO-string sort. Every state
// is honest: loading / ready / empty ("No posts in {town} yet") / error.
// R17: clock/RNG-free — timestamps are opaque strings.
import { useCallback, useEffect, useState } from 'react'
import {
  fetchPosts,
  getSession,
  partitionHot,
  sortByNewest,
  type FetchLike,
  type Post,
  type Session,
} from '../lib/feed'
import { FeedPostCard } from '../components/FeedPostCard'
import { FeedComposer } from '../components/FeedComposer'
import { IdentityPicker } from '../components/IdentityPicker'

type Sort = 'hot' | 'new'

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
  const [sort, setSort] = useState<Sort>('hot')
  const [posts, setPosts] = useState<Post[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')

  // Routing override: /t/<slug>/feed shows that town's feed regardless of
  // the session town. Falls back to the session town (plain /feed).
  const feedTown = townSlug ?? session?.townSlug ?? ''
  const townName = townSlug ? (townNameProp ?? townSlug) : (session?.townName ?? '')

  const load = useCallback(async () => {
    if (!feedTown) return
    setStatus('loading')
    setError('')
    const res = await fetchPosts({ town: feedTown, sort, fetchImpl })
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
    if (!feedTown) return
    let ignore = false
    setStatus('loading')
    setError('')
    void fetchPosts({ town: feedTown, sort, fetchImpl }).then((res) => {
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

  if (!session && !feedTown) {
    return (
      <section className="feed-page" aria-labelledby="feed-heading" data-testid="feed-page">
        <h1 id="feed-heading">Feed</h1>
        <p data-testid="feed-no-session">You're not in a town yet — pick a nickname and town to see the feed.</p>
        <IdentityPicker
          onSaved={(saved) => {
            setSession(saved)
          }}
        />
      </section>
    )
  }

  const { pinned, rest } = partitionHot(posts)
  const newest = sortByNewest(posts)

  return (
    <section className="feed-page" aria-labelledby="feed-heading" data-testid="feed-page">
      <div className="feed-toolbar">
        <h1 id="feed-heading">Feed</h1>
        <span className="feed-town-context" data-testid="feed-town">
          {townName}
        </span>
        <div className="feed-sort" role="group" aria-label="Sort">
          <button
            type="button"
            data-testid="sort-hot"
            aria-pressed={sort === 'hot'}
            onClick={() => setSort('hot')}
          >
            Hot
          </button>
          <button type="button" data-testid="sort-new" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>
            New
          </button>
        </div>
      </div>

      {session && (
        <FeedComposer session={session} fetchImpl={fetchImpl} onPosted={() => void load()} />
      )}

      {status === 'loading' && (
        <p className="feed-status" data-testid="feed-loading">
          Loading {townName} feed…
        </p>
      )}

      {status === 'error' && (
        <p className="feed-error" role="alert" data-testid="feed-error">
          Couldn't load the feed ({error}).{' '}
          <button type="button" data-testid="feed-retry" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {status === 'ready' && posts.length === 0 && (
        <p className="feed-empty" data-testid="feed-empty">
          No posts in {townName} yet.
        </p>
      )}

      {status === 'ready' && posts.length > 0 && (
        sort === 'hot' ? (
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
        )
      )}
    </section>
  )
}
