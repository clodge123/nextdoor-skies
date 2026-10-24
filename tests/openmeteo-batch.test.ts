import { describe, expect, it, vi } from 'vitest'
import {
  WEATHER_PROXY_PATH,
  WEATHER_MIN_ZOOM,
  MAX_CHUNK_TOWNS,
  REFRESH_INTERVAL_MS,
  buildProxyUrl,
  chunkBounds,
  chunkTowns,
  createWeatherRefresher,
  fetchCurrentTemps,
  filterVisibleTowns,
  parseProxyResponse,
  type FetchImpl,
  type TownCoord,
} from '../src/lib/weather/openmeteo-batch'

function town(id: string, lat: number, lon: number): TownCoord {
  return { id, name: id, lat, lon }
}

interface CallRecord {
  url: string
  init: { method: string; signal?: AbortSignal }
}

function makeFetch(
  payload: unknown,
  ok = true,
): FetchImpl & { calls: CallRecord[] } {
  const calls: CallRecord[] = []
  const impl = ((url: string, init: CallRecord['init']) => {
    calls.push({ url, init })
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => payload })
  }) as FetchImpl & { calls: CallRecord[] }
  impl.calls = calls
  return impl
}

describe('weather-proxy request shape (S5)', () => {
  it('GETs the same-origin /api/weather proxy with bbox + zoom', async () => {
    const fetchImpl = makeFetch({ temps: { a: 72.5 }, stale: false })
    const towns = [town('a', 39.78, -89.65)]
    const temps = await fetchCurrentTemps(towns, fetchImpl, 10)

    expect(fetchImpl.calls).toHaveLength(1)
    const call = fetchImpl.calls[0]
    expect(call.url).toContain(WEATHER_PROXY_PATH)
    expect(call.url).toContain('bbox=')
    expect(call.url).toContain('zoom=10')
    expect(call.init.method).toBe('GET')
    // Fahrenheit in, Celsius out (badge pipeline unchanged).
    expect(temps).toEqual([{ townId: 'a', temperatureC: Math.round(((72.5 - 32) * 5) / 9 * 1e10) / 1e10 }])
  })

  it('buildProxyUrl normalizes corners and embeds zoom', () => {
    const url = buildProxyUrl({ west: -90, south: 39, east: -89, north: 40 }, 12)
    expect(url).toBe('/api/weather?bbox=-90,39,-89,40&zoom=12')
    const flipped = buildProxyUrl({ west: -89, south: 40, east: -90, north: 39 }, 12)
    expect(flipped).toBe(url)
  })

  it('throws on non-ok responses', async () => {
    const fetchImpl = makeFetch({}, false)
    await expect(fetchCurrentTemps([town('a', 1, 1)], fetchImpl, 9)).rejects.toThrow(/HTTP 500/)
  })

  it('zoom gate constant matches the W4-BF single-gate law (1)', () => {
    // Badges render from z1 (tier bands), so the feed gate equals the
    // LOWEST badge-visible zoom — any badge on screen has an eligible feed.
    expect(WEATHER_MIN_ZOOM).toBe(1)
  })
})

describe('proxy chunking (<=50 towns per request)', () => {
  it('chunkTowns splits at the 50 boundary', () => {
    const towns = Array.from({ length: 120 }, (_, i) => town(`t${i}`, 0, 0))
    const chunks = chunkTowns(towns)
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 20])
    expect(chunks.every((c) => c.length <= MAX_CHUNK_TOWNS)).toBe(true)
  })

  it('exactly 50 stays one chunk', () => {
    const towns = Array.from({ length: 50 }, (_, i) => town(`t${i}`, 0, 0))
    expect(chunkTowns(towns).map((c) => c.length)).toEqual([50])
  })

  it('empty input yields no chunks', () => {
    expect(chunkTowns([])).toEqual([])
  })

  it('chunkBounds wraps a chunk tightly', () => {
    const b = chunkBounds([town('a', 10, -20), town('b', 12, -18)])
    expect(b).toEqual({ west: -20, south: 10, east: -18, north: 12 })
  })

  it('fetchCurrentTemps issues one GET per 50-town chunk, bbox per chunk', async () => {
    const towns = Array.from({ length: 120 }, (_, i) => town(`t${i}`, i * 0.001, i * 0.01))
    const fetchImpl = makeFetch({ temps: {} })
    await fetchCurrentTemps(towns, fetchImpl, 9)
    expect(fetchImpl.calls).toHaveLength(3)
    for (const call of fetchImpl.calls) {
      const bbox = new URL('http://x' + call.url).searchParams.get('bbox')!
      const [w, s, e, n] = bbox.split(',').map(Number)
      expect(w).toBeLessThanOrEqual(e)
      expect(s).toBeLessThanOrEqual(n)
    }
  })
})

describe('viewport culling', () => {
  const towns = [
    town('in-view', 39.78, -89.65),
    town('edge', 39.76, -89.69),
    town('faraway', 44.98, -93.27),
  ]
  const bounds = { west: -89.7, east: -89.6, south: 39.7, north: 39.8 }

  it('keeps towns inside bounds and drops outside ones', () => {
    const visible = filterVisibleTowns(towns, bounds, 0)
    expect(visible.map((t) => t.id)).toEqual(['in-view', 'edge'])
  })

  it('margin widens the cull box', () => {
    const visible = filterVisibleTowns(towns, bounds, 0.5)
    expect(visible.map((t) => t.id)).toContain('edge')
    expect(visible.map((t) => t.id)).not.toContain('faraway')
  })
})

describe('parseProxyResponse honesty (R19)', () => {
  it('converts present towns F->C and skips absent ones', () => {
    const towns = [town('a', 0, 0), town('b', 0, 0)]
    const parsed = parseProxyResponse({ temps: { a: 32, b: 'x' }, stale: false }, towns)
    expect(parsed).toEqual([{ townId: 'a', temperatureC: 0 }])
  })

  it('returns [] for malformed payloads', () => {
    expect(parseProxyResponse({}, [town('a', 0, 0)])).toEqual([])
    expect(parseProxyResponse({ temps: null }, [town('a', 0, 0)])).toEqual([])
  })

  it('a fully-empty temps map degrades to no entries (no fake temps)', () => {
    const parsed = parseProxyResponse({ temps: {}, stale: true }, [town('a', 0, 0)])
    expect(parsed).toEqual([])
  })
})

describe('refresher cadence (law 2: per 5-min window, NOT per pan)', () => {
  it('fetches on window cadence with current viewport, not on pan', async () => {
    vi.useFakeTimers()
    try {
      let viewport = { west: -90, east: -89, south: 39, north: 40 }
      const fetchImpl = makeFetch({ temps: { a: 44.6 }, stale: false })
      const onTemps = vi.fn()
      const refresher = createWeatherRefresher({
        getTowns: () => [town('a', 39.5, -89.5)],
        getViewport: () => viewport,
        getZoom: () => 10,
        fetchImpl,
        onTemps,
        intervalMs: REFRESH_INTERVAL_MS,
        setIntervalFn: (cb, ms) => setInterval(cb, ms),
        clearIntervalFn: (id) => clearInterval(id),
      })
      refresher.start()
      expect(fetchImpl.calls).toHaveLength(1) // first window fires immediately

      // Panning (viewport change) must NOT trigger a fetch.
      viewport = { west: -90.5, east: -88.5, south: 38.5, north: 40.5 }
      expect(fetchImpl.calls).toHaveLength(1)

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
      await vi.waitFor(() => expect(fetchImpl.calls).toHaveLength(2))
      await vi.waitFor(() => expect(onTemps).toHaveBeenCalled())
      const emitted = onTemps.mock.calls[0][0]
      expect(emitted[0].townId).toBe('a')
      expect(emitted[0].temperatureC).toBeCloseTo(7, 5)
      refresher.stop()

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3)
      expect(fetchImpl.calls).toHaveLength(2) // stopped: no more windows
    } finally {
      vi.useRealTimers()
    }
  })

  it('failed window keeps last data (law 3)', async () => {
    let ok = true
    const fetchImpl: FetchImpl = (_url, _init) =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        json: async () => ({ temps: { a: 53.6 }, stale: false }),
      })
    const onTemps = vi.fn()
    const refresher = createWeatherRefresher({
      getTowns: () => [town('a', 0, 0)],
      getViewport: () => ({ west: -1, east: 1, south: -1, north: 1 }),
      fetchImpl,
      onTemps,
      setIntervalFn: () => 0 as unknown as ReturnType<typeof setInterval>,
    })
    refresher.start()
    await vi.waitFor(() => expect(onTemps).toHaveBeenCalledTimes(1))
    ok = false
    refresher.start() // no-op (already started)
    await Promise.resolve()
    expect(onTemps).toHaveBeenCalledTimes(1) // no new emission, last data wins
  })

  it('pan-cancels-stale: a new window aborts the previous in-flight fetch', async () => {
    const signals: AbortSignal[] = []
    const gates: Array<(v: { ok: boolean; status: number; json: () => Promise<unknown> }) => void> = []
    const fetchImpl: FetchImpl = (_url, init) => {
      signals.push(init.signal!)
      return new Promise((resolve) => gates.push(resolve))
    }
    const onTemps = vi.fn()
    const refresher = createWeatherRefresher({
      getTowns: () => [town('a', 0, 0)],
      getViewport: () => ({ west: -1, east: 1, south: -1, north: 1 }),
      fetchImpl,
      onTemps,
      setIntervalFn: () => 0 as unknown as ReturnType<typeof setInterval>,
    })
    refresher.start() // window 1 in flight
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(false)

    refresher.stop() // stop aborts the in-flight window
    expect(signals[0].aborted).toBe(true)

    // Late response for the aborted window must NOT emit temps.
    gates[0]({ ok: true, status: 200, json: async () => ({ temps: { a: 70 }, stale: false }) })
    await vi.waitFor(() => expect(onTemps).toHaveBeenCalledTimes(0))
  })
})
