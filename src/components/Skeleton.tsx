// W4-C1 SKELETON — X-style shimmer placeholders (wave-4 session 2 law 1:
// "skeleton shimmer replaces static 'awaiting feed' while fetching — real
// card shapes, animated, ~300ms fade to content"). Square geometry (R20:
// border-radius ONLY var(--radius)); neon tokens (--surface + --accent).
// CSS lives in index.css (.nds-skeleton* + .nds-fade-in).
import type { Post } from '../lib/feed'

/** One shimmer block (avatar square, text line, meta line). */
export function SkeletonPost({ testId }: { testId?: string }) {
  return (
    <div className="nds-skeleton-card" data-testid={testId ?? 'skeleton-post'} aria-hidden="true">
      <div className="nds-skeleton-avatar" />
      <div className="nds-skeleton-lines">
        <div className="nds-skeleton-line nds-skeleton-line-long" />
        <div className="nds-skeleton-line nds-skeleton-line-short" />
        <div className="nds-skeleton-meta" />
      </div>
    </div>
  )
}

/** A feed list of real card shapes — the shape mirrors FeedPostCard rows. */
export function SkeletonFeed({ count = 3, testId = 'feed-skeleton' }: { count?: number; testId?: string }) {
  return (
    <div className="nds-skeleton-feed" data-testid={testId} role="status" aria-label="Loading feed">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonPost key={i} />
      ))}
    </div>
  )
}

/** Panel list (compact rows, matches TownPanel post rows). */
export function SkeletonPanel({ count = 3, testId = 'town-panel-skeleton' }: { count?: number; testId?: string }) {
  return (
    <div className="nds-skeleton-feed" data-testid={testId} role="status" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonPost key={i} />
      ))}
    </div>
  )
}

/** Cached-first helper: last-good posts render immediately (fade in),
 *  skeletons only when there is NOTHING cached (first visit to this town). */
export function postsLoadingState(cachedCount: number): 'empty-cache' | 'revalidate' {
  return cachedCount === 0 ? 'empty-cache' : 'revalidate'
}

/** Stable key for the posts cache (SWR pattern, extends the weather
 *  last-data-wins law to posts — session 2 law 3).
 *  W4-C2 FEED-LOAD: per-page keys. Page 1 keeps the LEGACY shape
 *  (`<town>|<sort>`) so TownPanel's cached-first read is byte-identical;
 *  pages >= 2 get the explicit `<town>|<sort>|<page>` form. */
export function postsCacheKey(town: string, sort: 'hot' | 'new', page = 1): string {
  return page > 1 ? `${town}|${sort}|${page}` : `${town}|${sort}`
}

/** In-memory last-good posts (module-level; survives route changes, dies
 *  with the tab — honest cache, never fabricated data). */
const postsCache = new Map<string, Post[]>()

export function readPostsCache(key: string): Post[] | undefined {
  return postsCache.get(key)
}

export function writePostsCache(key: string, posts: Post[]): void {
  postsCache.set(key, posts)
}

/** Test seam. */
export function resetPostsCache(): void {
  postsCache.clear()
}
