import { describe, expect, it, vi } from 'vitest'
import {
  OPEN_METEO_BATCH_URL,
  MAX_BATCH_COORDS,
  REFRESH_INTERVAL_MS,
  buildBatchRequestBody,
  chunkTowns,
  createWeatherRefresher,
  fetchCurrentTemps,
  filterVisibleTowns,
  parseBatchResponse,
  type FetchImpl,
  type TownCoord,
} from '../src/lib/weather/openmeteo-batch'

function town(id: string, lat: number, lon: number): TownCoord {
  return { id, name: id, lat, lon }
}

interface CallRecord {
  url: string
  init: { method: string; headers: Record<string, string>; body: string }
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

describe('openmeteo-batch request shape', () => {
  it('POSTs to the batch endpoint with parallel-array body', async () => {
    const fetchImpl = makeFetch({ batch: [{ current: { temperature_2m: 21.5 } }] })
    const towns = [town('a', 39.78, -89.65)]
    const temps = await fetchCurrentTemps(towns, fetchImpl)

    expect(fetchImpl.calls).toHaveLength(1)
    const call = fetchImpl.calls[0]
    expect(call.url).toBe(OPEN_METEO_BATCH_URL)
    expect(call.url).toContain('/v1/batch')
    expect(call.init.method).toBe('POST')
    expect(call.init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(call.init.body)
    expect(body.batch).toHaveLength(1)
    expect(body.batch[0]).toMatchObject({
      latitude: 39.78,
      longitude: -89.65,
      current: 'temperature_2m',
    })
    expect(temps).toEqual([{ townId: 'a', temperatureC: 21.5 }])
  })

  it('builds one batch entry per town, order-preserved', () => {
    const towns = [town('a', 1, 2), town('b', 3, 4)]
    const body = buildBatchRequestBody(towns)
    expect(body.batch.map((b) => b.latitude)).toEqual([1, 3])
    expect(body.batch.map((b) => b.longitude)).toEqual([2, 4])
  })

  it('throws on non-ok responses', async () => {
    const fetchImpl = makeFetch({}, false)
    await expect(fetchCurrentTemps([town('a', 1, 1)], fetchImpl)).rejects.toThrow(/HTTP 500/)
  })
})

describe('openmeteo-batch chunking (<=1000 coords per call)', () => {
  it('chunkTowns splits at the 1000 boundary', () => {
    const towns = Array.from({ length: 2500 }, (_, i) => town(`t${i}`, 0, 0))
    const chunks = chunkTowns(towns)
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500])
    expect(chunks.every((c) => c.length <= MAX_BATCH_COORDS)).toBe(true)
  })

  it('exactly 1000 stays one chunk', () => {
    const towns = Array.from({ length: 1000 }, (_, i) => town(`t${i}`, 0, 0))
    expect(chunkTowns(towns).map((c) => c.length)).toEqual([1000])
  })

  it('empty input yields no chunks', () => {
    expect(chunkTowns([])).toEqual([])
  })

  it('fetchCurrentTemps issues one POST per chunk, each <=1000 entries', async () => {
    const towns = Array.from({ length: 1500 }, (_, i) => town(`t${i}`, i * 0.001, 0))
    const fetchImpl = makeFetch({ batch: [] })
    await fetchCurrentTemps(towns, fetchImpl)
    expect(fetchImpl.calls).toHaveLength(2)
    const sizes = fetchImpl.calls.map((c) => JSON.parse(c.init.body).batch.length)
    expect(sizes).toEqual([1000, 500])
  })
})

describe('openmeteo-batch viewport culling', () => {
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

describe('parseBatchResponse honesty (R19)', () => {
  it('skips entries without a finite temperature', () => {
    const towns = [town('a', 0, 0), town('b', 0, 0)]
    const parsed = parseBatchResponse(
      { batch: [{ current: { temperature_2m: 10 } }, { current: { temperature_2m: null } }] },
      towns,
    )
    expect(parsed).toEqual([{ townId: 'a', temperatureC: 10 }])
  })

  it('returns [] for malformed payloads', () => {
    expect(parseBatchResponse({}, [town('a', 0, 0)])).toEqual([])
  })
})

describe('refresher cadence (law 2: per 5-min window, NOT per pan)', () => {
  it('fetches on window cadence with current viewport, not on pan', async () => {
    vi.useFakeTimers()
    try {
      let viewport = { west: -90, east: -89, south: 39, north: 40 }
      const fetchImpl = makeFetch({ batch: [{ current: { temperature_2m: 7 } }] })
      const onTemps = vi.fn()
      const refresher = createWeatherRefresher({
        getTowns: () => [town('a', 39.5, -89.5)],
        getViewport: () => viewport,
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
      await vi.waitFor(() => expect(onTemps).toHaveBeenCalledWith([{ townId: 'a', temperatureC: 7 }]))
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
        json: async () => ({ batch: [{ current: { temperature_2m: 12 } }] }),
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
})
