// W4-C1 FETCH-HYGIENE — netFetch contract (wave-4 session 2 law 2):
// 10s timeout fires, ONE retry with 300ms backoff, supersede ABORTS the
// older in-flight request for the same key (Google Maps rule). Fake timers
// keep R17 clean (no wall-clock in logic).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  netFetch,
  abortKey,
  netInflightKeys,
  FETCH_TIMEOUT_MS,
  FETCH_RETRY_DELAY_MS,
} from './net'

type CallRecord = { url: string; signal?: AbortSignal | null }

/** fetchImpl seam: resolves after `ms`, rejects with AbortError if the
 *  signal aborts first — exactly how window.fetch behaves. */
function delayedFetch(
  ms: number,
  opts: { status?: number } = {},
): ((url: string, init?: RequestInit) => Promise<Response>) & { calls: CallRecord[] } {
  const calls: CallRecord[] = []
  const impl = (url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({ url, signal: init?.signal })
      const timer = setTimeout(() => {
        resolve({ ok: (opts.status ?? 200) < 400, status: opts.status ?? 200 } as Response)
      }, ms)
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('The user aborted a request.', 'AbortError'))
      })
    })
  return Object.assign(impl, { calls })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('netFetch (W4-C1 request hygiene)', () => {
  it('timeout fires: 10s abort -> 300ms backoff -> second 10s abort -> honest failure', async () => {
    vi.useFakeTimers()
    const fetchImpl = delayedFetch(90_000) // server that never answers
    const settled = netFetch('/api/posts?town=x&sort=new', {
      fetchImpl,
      key: 'posts:x:new',
    }).then(
      () => 'resolved',
      (err: unknown) => err,
    )

    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS) // attempt 1 aborts
    await vi.advanceTimersByTimeAsync(FETCH_RETRY_DELAY_MS) // backoff
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS) // attempt 2 aborts

    const err = (await settled) as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/timed out after 10000ms/)
    expect(fetchImpl.calls).toHaveLength(2) // exactly ONE retry
  }, 10_000)

  it('retries exactly once on 5xx, then reports the status honestly', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as Response)
    const res = await netFetch('/api/posts?town=x&sort=new', { fetchImpl })
    expect(res.status).toBe(500)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries once on transport failure, resolves on the second attempt', async () => {
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      if (n === 1) throw new TypeError('network down')
      return { ok: true, status: 200 } as Response
    })
    const res = await netFetch('/api/posts?town=x&sort=new', { fetchImpl })
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('POST never retries (no double-create on a flaky mutation)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('boom')
    })
    await expect(netFetch('/api/posts', { fetchImpl, method: 'POST' })).rejects.toThrow(/boom/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('supersede: a newer request for the same key ABORTS the older one', async () => {
    const fetchImpl = delayedFetch(30)
    const p1 = netFetch('/api/posts?town=a&sort=new', { key: 'panel-posts', fetchImpl })
    const p2 = netFetch('/api/posts?town=b&sort=new', { key: 'panel-posts', fetchImpl })
    await expect(p1).rejects.toThrow(/abort/i) // old request cancelled, never lands
    expect(await p2).toBeTruthy() // newest wins
    expect(fetchImpl.calls[0].signal?.aborted).toBe(true)
    expect(fetchImpl.calls).toHaveLength(2)
  })

  it('in-flight tracking: keys visible while pending, removed when settled/aborted', async () => {
    const fetchImpl = delayedFetch(30)
    const p = netFetch('/api/posts?town=a&sort=new', { key: 'posts:a:new', fetchImpl })
    expect(netInflightKeys()).toContain('posts:a:new')
    await p
    expect(netInflightKeys()).not.toContain('posts:a:new')

    const p2 = netFetch('/api/posts?town=b&sort=new', { key: 'posts:b:new', fetchImpl })
    abortKey('posts:b:new')
    await expect(p2).rejects.toThrow(/abort/i)
    expect(netInflightKeys()).not.toContain('posts:b:new')
  })

  it('external signal (unmount) aborts immediately, no retry', async () => {
    const fetchImpl = delayedFetch(5_000)
    const controller = new AbortController()
    const p = netFetch('/api/posts?town=a&sort=new', {
      key: 'posts:a:new',
      fetchImpl,
      signal: controller.signal,
    })
    controller.abort()
    await expect(p).rejects.toThrow(/abort/i)
    expect(fetchImpl.calls).toHaveLength(1) // aborted requests do NOT resurrect
  })
})
