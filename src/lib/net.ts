// W4-C1 FETCH-HYGIENE — shared fetch wrapper (wave-4 session 2 DECIDED,
// docs/WAVE-4-BRAINSTORM.md law 2: "every feed/panel fetch gets a 10s timeout
// + 1 retry with backoff; pan/zoom fast ABORTS superseded requests — Google
// Maps rule, never let an old request block a new one").
//
// Rules implemented here, in ONE place, so no surface re-invents them:
//   1. 10s timeout per attempt (AbortController) — nothing hangs forever.
//      (Root cause of the Jeffersonville "awaiting feed" stall: no timeout.)
//   2. ONE retry with 300ms backoff on transport failure, timeout, or 5xx.
//   3. Per-key ABORT of superseded requests: the newest request for a key
//      kills the older in-flight one. An aborted request never lands and
//      never retries (its caller discards it — last-data-wins / ignore-flag).
//
// Determinism (R17): no Date.now / Math.random / new Date — setTimeout only.
// The fetch is injectable (fetchImpl) exactly like the weather refresher seam.

export const FETCH_TIMEOUT_MS = 10_000
export const FETCH_RETRY_DELAY_MS = 300

export type NetFetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface NetFetchOptions {
  /** Supersession key (e.g. `posts:springfield:new`, `weather`, `alerts`).
   *  A new request with the same key ABORTS the older in-flight one. */
  key?: string
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  /** External signal (component unmount / window boundary): abort, no retry. */
  signal?: AbortSignal
  timeoutMs?: number
  retryDelayMs?: number
  fetchImpl?: NetFetchLike
}

/** In-flight controllers per supersession key. */
const inFlight = new Map<string, AbortController>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * fetch + timeout + retry + supersession. Resolves with the Response
 * (HTTP error statuses are NOT thrown — the caller maps them, same contract
 * as window.fetch). Rejects only after the single retry fails, or immediately
 * when the request is superseded / externally cancelled.
 */
export async function netFetch(url: string, opts: NetFetchOptions = {}): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => window.fetch(input, init))
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS
  const retryDelayMs = opts.retryDelayMs ?? FETCH_RETRY_DELAY_MS
  const key = opts.key
  const method = (opts.method ?? 'GET').toUpperCase()
  // Idempotency law: only GETs retry. A retried POST could double-create
  // (post/reaction/comment), so mutations get ONE attempt, timeout only.
  const attempts = method === 'GET' ? 2 : 1
  let lastError: unknown = new Error(`netFetch(${url}): request failed`)

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs)
    if (opts.signal?.aborted) throw abortError()

    const controller = new AbortController()
    if (key) {
      // Google Maps rule: this request supersedes any older in-flight one.
      const stale = inFlight.get(key)
      if (stale && stale !== controller) stale.abort()
      inFlight.set(key, controller)
    }
    const onExternalAbort = () => controller.abort()
    opts.signal?.addEventListener('abort', onExternalAbort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const res = await fetchImpl(url, {
        method: opts.method ?? 'GET',
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
      })
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onExternalAbort)
      if (key && inFlight.get(key) === controller) inFlight.delete(key)
      if (res.status >= 500 && attempt + 1 < attempts) {
        lastError = new Error(`HTTP ${res.status}`)
        continue // 5xx: one retry (GET only), then report honestly.
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onExternalAbort)
      if (key && inFlight.get(key) === controller) inFlight.delete(key)
      // Externally cancelled (unmount) or superseded by a newer request:
      // reject immediately — a stale request must NOT resurrect via retry.
      if (opts.signal?.aborted) throw err
      if (controller.signal.aborted && !timedOut) throw err
      lastError = timedOut
        ? new Error(`netFetch(${url}): timed out after ${timeoutMs}ms`)
        : err // transport failure: fall through to retry.
    }
  }
  throw lastError
}

function abortError(): DOMException {
  return new DOMException('The user aborted a request.', 'AbortError')
}

/** Cancel every in-flight request under `key` (viewport left, unmount). */
export function abortKey(key: string): void {
  const controller = inFlight.get(key)
  if (controller) {
    controller.abort()
    inFlight.delete(key)
  }
}

/** Keys currently in flight (e2e seam — proves supersession, no timing side
 *  effects). Exposed on window as __ndsNetKeys for the loading spec. */
export function netInflightKeys(): string[] {
  return [...inFlight.keys()]
}

if (typeof window !== 'undefined') {
  const w = window as unknown as { __ndsNetKeys?: () => string[] }
  w.__ndsNetKeys = netInflightKeys
}
