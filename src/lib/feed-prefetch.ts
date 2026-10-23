// W4-C2 FEED-LOAD — town-ring PREFETCH (docs/WAVE-4-BRAINSTORM.md S2 law 3:
// "extend the A1 neighbor-ring prefetch law to posts — on idle, prefetch the
// visible town's feed, SWR-cached so the next tap shows data instantly").
//
// Laws this file enforces, in ONE place:
//   * Key prefix `prefetch:` — a prefetch NEVER shares a supersession key
//     with a user request (`posts:<town>:<sort>`), so a background prefetch
//     can never abort a live panel/feed request (net.ts abort-supersede law).
//   * Dedupe per key: a second hover on the same town while its prefetch is
//     in flight is a NO-OP (no request storms).
//   * LRU cap of PREFETCH_MAX_TOWNS (3): only the most recently focused
//     towns get prefetched; the eviction is a pure counter order (R17: no
//     Date.now / Math.random — recency rides a monotonic sequence).
//   * SWR write-through: a completed prefetch lands in the per-page posts
//     cache (`<town>|<sort>|1`), so opening the panel/feed shows data
//     INSTANTLY, then revalidates (cached-first law, weather last-data-wins).
//
// Failure law: a prefetch that fails is silently dropped (it is an
// optimization, not a surface — the user-facing request path owns honest
// error UI). No console noise, no fake data.
import { fetchPosts, type FetchLike } from './feed'
import { postsCacheKey, writePostsCache } from '../components/Skeleton'
import { abortKey } from './net'

/** LRU cap: at most 3 towns prefetched at once (ring law — the visible
 *  town + its closest neighbors; the map viewport shows ~2-6 badges). */
export const PREFETCH_MAX_TOWNS = 3

/** Supersession-key prefix — the C1 contract: prefetch keys NEVER collide
 *  with user keys, so prefetches can't abort user requests (and the newest
 *  prefetch for a key still supersedes the older prefetch, Google Maps rule). */
export function prefetchKey(town: string, sort: 'hot' | 'new'): string {
  return `prefetch:posts:${town || 'all'}:${sort}`
}

/** LRU bookkeeping: key -> recency counter (monotonic, deterministic). */
const lru = new Map<string, number>()
const inflight = new Set<string>()
let seq = 0

/**
 * Fire a page-1 prefetch for `town` (sort defaults to 'new' — the panel/
 * feed cache key). Returns true when a request was actually issued, false
 * when deduped (in flight) — the return value is the test seam.
 */
export function prefetchTownPosts(
  town: string,
  sort: 'hot' | 'new' = 'new',
  fetchImpl?: FetchLike,
): boolean {
  const key = prefetchKey(town, sort)
  if (inflight.has(key)) {
    // Dedupe: bump recency, no second request (no request storms).
    lru.set(key, ++seq)
    return false
  }
  // LRU insert + eviction of the least-recently-used town beyond the cap.
  // An evicted prefetch is ABORTED (its key is prefetch-only — aborting it
  // can never touch a user request), so "≤3 towns prefetched" is real:
  // at most PREFETCH_MAX_TOWNS prefetch requests exist at any instant.
  lru.set(key, ++seq)
  if (lru.size > PREFETCH_MAX_TOWNS) {
    let oldestKey = ''
    let oldest = Number.POSITIVE_INFINITY
    for (const [k, v] of lru) {
      if (v < oldest) {
        oldest = v
        oldestKey = k
      }
    }
    if (oldestKey !== key) {
      lru.delete(oldestKey)
      inflight.delete(oldestKey)
      abortKey(oldestKey) // supersession-safe: prefetch keys are isolated
    }
  }

  inflight.add(key)
  void fetchPosts({ town: town || undefined, sort, fetchImpl, key })
    .then((res) => {
      if (res.ok) writePostsCache(postsCacheKey(town, sort, 1), res.data)
      // Failed prefetch: silently dropped (optimization path, no UI).
    })
    .catch(() => {
      /* prefetches never surface errors — the user request path owns them */
    })
    .finally(() => {
      inflight.delete(key)
    })
  return true
}

/** Keys currently in prefetch (e2e/test seam — proves dedupe + LRU). */
export function prefetchInflightKeys(): string[] {
  return [...inflight]
}

/** LRU-tracked prefetch keys (survive completion — e2e seam proving the
 *  prefetch ring fired, isolated from transient in-flight state). */
export function prefetchLruKeys(): string[] {
  return [...lru.keys()]
}

/** Test seam: forget every LRU/dedupe bookkeeping state. */
export function resetPrefetch(): void {
  lru.clear()
  inflight.clear()
  seq = 0
}

if (typeof window !== 'undefined') {
  const w = window as unknown as { __ndsPrefetchKeys?: () => string[]; __ndsPrefetchTowns?: () => string[] }
  w.__ndsPrefetchKeys = prefetchInflightKeys
  w.__ndsPrefetchTowns = prefetchLruKeys
}
