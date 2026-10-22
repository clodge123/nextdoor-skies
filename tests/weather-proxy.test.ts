/**
 * W3-A1 weather proxy (api/weather.js) — server-function unit tests:
 * query parsing, zoom gate, 50-town cap, concurrency cap, 60-min town cache,
 * stale-while-revalidate, neighbor-ring prefetch, graceful degradation,
 * unit normalization. Injected clocks ONLY — no Date.now in this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TOWNS_PER_REQUEST,
  MAX_UPSTREAM_CONCURRENCY,
  MAX_PREFETCH_TOWNS,
  CACHE_TTL_MS,
  MIN_ZOOM,
  UPSTREAM_FORECAST_URL,
  cacheGet,
  cacheSet,
  chunkArray,
  forecastUrl,
  handleWeather,
  mapWithConcurrency,
  neighborRing,
  normalizeTempF,
  parseWeatherQuery,
  prefetchTowns,
  resetWeatherCache,
  slugify,
  townId,
  townsInBbox,
} from '../api/weather.js'

// Contains exactly the baked Springfield, IL (39.8017, -89.6437).
const SPRINGFIELD = { west: -89.66, south: 39.8, east: -89.63, north: 39.81 }
// Springfield + 4 satellites; its neighbor ring is 10 towns (Chatham et al.).
const SPRINGFIELD_WIDE = { west: -89.75, south: 39.75, east: -89.55, north: 39.85 }

function omPayload(celsius: number) {
  return {
    current_units: { temperature_2m: '°C' },
    current: { temperature_2m: celsius },
  }
}

beforeEach(() => {
  resetWeatherCache()
})

describe('parseWeatherQuery', () => {
  it('parses bbox + zoom, normalizing corners', () => {
    const q = parseWeatherQuery(new URLSearchParams('bbox=-89.6,39.8,-90,39&zoom=11'))
    expect(q).toEqual({ west: -90, south: 39, east: -89.6, north: 39.8, zoom: 11 })
  })

  it('rejects missing/garbage params', () => {
    expect(parseWeatherQuery(new URLSearchParams('zoom=9'))).toBeNull()
    expect(parseWeatherQuery(new URLSearchParams('bbox=1,2,3&zoom=9'))).toBeNull()
    expect(parseWeatherQuery(new URLSearchParams('bbox=a,2,3,4&zoom=9'))).toBeNull()
    expect(parseWeatherQuery(new URLSearchParams('bbox=1,2,3,4'))).toBeNull()
  })
})

describe('slug helpers (mirrors of MapPage/gazetteer)', () => {
  it('slugify + townId match the client format exactly', () => {
    expect(slugify('New York City')).toBe('new-york-city')
    expect(townId('Springfield', 39.7817, -89.6501)).toBe('springfield-39.78--89.65')
  })

  it('townsInBbox filters by lon/lat', () => {
    const towns = [
      { name: 'in', lat: 39.78, lon: -89.65 },
      { name: 'out', lat: 44.98, lon: -93.27 },
    ]
    expect(townsInBbox(towns, -89.7, 39.7, -89.6, 39.8).map((t) => t.name)).toEqual(['in'])
  })
})

describe('normalizeTempF (live-probe law: trust the response label)', () => {
  it('converts labeled °C to °F', () => {
    expect(normalizeTempF(omPayload(0))).toBeCloseTo(32, 6)
    expect(normalizeTempF(omPayload(21.2))).toBeCloseTo(70.16, 1)
  })

  it('passes labeled °F through untouched', () => {
    expect(
      normalizeTempF({ current_units: { temperature_2m: '°F' }, current: { temperature_2m: 70.1 } }),
    ).toBe(70.1)
  })

  it('degrades on missing/unlabeled/NaN readings — never guesses', () => {
    expect(normalizeTempF({})).toBeUndefined()
    expect(normalizeTempF({ current: { temperature_2m: 5 } })).toBeUndefined()
    expect(normalizeTempF({ current_units: {}, current: { temperature_2m: null } })).toBeUndefined()
  })
})

describe('chunkArray + mapWithConcurrency', () => {
  it('chunks preserve order', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(() => chunkArray([], 0)).toThrow(/>= 1/)
  })

  it('runs jobs with a hard in-flight cap, order preserved', async () => {
    let inflight = 0
    let peak = 0
    const jobs = Array.from({ length: 30 }, (_, i) => async () => {
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 1))
      inflight--
      return i
    })
    const results = await mapWithConcurrency(jobs, MAX_UPSTREAM_CONCURRENCY)
    expect(results).toEqual(Array.from({ length: 30 }, (_, i) => i))
    expect(peak).toBeLessThanOrEqual(MAX_UPSTREAM_CONCURRENCY)
  })
})

describe('handleWeather (S5 core)', () => {
  it('below zoom 9 returns empty, no upstream calls', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => omPayload(20) }))
    const out = await handleWeather({ ...SPRINGFIELD, zoom: MIN_ZOOM - 1 }, { fetchImpl })
    expect(out).toEqual({ temps: {}, stale: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('resolves towns in bbox and hits the per-town /v1/forecast endpoint', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, json: async () => omPayload(21.2) }
    })
    const out = await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl, prefetch: false })
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith(UPSTREAM_FORECAST_URL) && u.includes('current=temperature_2m'))).toBe(true)
    expect(urls.every((u) => u.includes(forecastUrl(1, 1).split('?')[0]))).toBe(true)
    const slugs = Object.keys(out.temps)
    expect(slugs.length).toBe(urls.length)
    expect(slugs.every((s) => /^[a-z0-9-]+-\d+\.\d+--?\d+\.\d+$/.test(s))).toBe(true)
    for (const f of Object.values(out.temps)) expect(f).toBeCloseTo(70.16, 1)
    expect(out.stale).toBe(false)
  })

  it('caps at 50 towns per request', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => omPayload(15) }))
    const out = await handleWeather(
      { west: -74.1, south: 40.6, east: -73.9, north: 40.8, zoom: 10 },
      { fetchImpl, prefetch: false },
    )
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(MAX_TOWNS_PER_REQUEST)
    expect(Object.keys(out.temps).length).toBeLessThanOrEqual(MAX_TOWNS_PER_REQUEST)
  })

  it('caps upstream concurrency at 10 in flight', async () => {
    let inflight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 2))
      inflight--
      return { ok: true, json: async () => omPayload(15) }
    })
    await handleWeather(
      { west: -74.1, south: 40.6, east: -73.9, north: 40.8, zoom: 10 },
      { fetchImpl, prefetch: false },
    )
    expect(peak).toBeLessThanOrEqual(MAX_UPSTREAM_CONCURRENCY)
  })

  it('town-keyed cache: second request within TTL makes ZERO upstream calls', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => omPayload(21.2) }))
    const now = 1_730_000_000_000
    const first = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now, prefetch: false },
    )
    const callsAfterFirst = fetchImpl.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const second = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now: now + 1000, prefetch: false },
    )
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst) // no new calls
    expect(second.temps).toEqual(first.temps)

    // TTL expiry (60 min): the request serves last-known temps instantly,
    // refreshes in the background (SWR), and the NEXT request is fresh.
    const bg: Promise<unknown>[] = []
    const expired = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now: now + CACHE_TTL_MS + 1, prefetch: false, schedule: (p) => bg.push(p) },
    )
    expect(expired.temps).toEqual(first.temps) // stale-served instantly, no blocking
    await Promise.all(bg)
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst + 1) // only the SWR refresh fired
    const refreshed = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now: now + CACHE_TTL_MS + 2, prefetch: false },
    )
    expect(refreshed.temps).toEqual(first.temps)
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst + 1) // fresh cache: zero new calls
  })

  it('graceful degradation: failed towns are absent, not faked (R19)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('-89.6437')) return { ok: true, json: async () => omPayload(21.2) }
      return { ok: false, status: 503, json: async () => ({}) }
    })
    const out = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, prefetch: false },
    )
    const springfield = Object.entries(out.temps).filter(([s]) => s.startsWith('springfield'))
    expect(springfield.length).toBe(1)
    expect(out.stale).toBe(false)
  })

  it('all towns failing -> stale=true, temps empty (honest, never fake)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    const out = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, prefetch: false },
    )
    expect(out.temps).toEqual({})
    expect(out.stale).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// W3-A1: 60-minute cache + SWR + neighbor-ring prefetch (wave-3 session 1)
// ---------------------------------------------------------------------------

describe('W3-A1 cache laws', () => {
  it('TTL is 60 minutes (session-1 decision 1)', () => {
    expect(CACHE_TTL_MS).toBe(60 * 60_000)
  })

  it('cacheGet: undefined on miss, fresh before expiry, stale after', () => {
    const now = 1_730_000_000_000
    expect(cacheGet('ghost-1.00--1.00', now)).toBeUndefined()
    cacheSet('ghost-1.00--1.00', 70, now)
    expect(cacheGet('ghost-1.00--1.00', now)).toEqual({ tempF: 70, state: 'fresh' })
    expect(cacheGet('ghost-1.00--1.00', now + CACHE_TTL_MS)).toEqual({
      tempF: 70,
      state: 'stale',
    })
    expect(cacheGet('ghost-1.00--1.00', now + CACHE_TTL_MS + 1)).toEqual({
      tempF: 70,
      state: 'stale',
    })
  })

  it('neighborRing: expands every side, drops towns already inside', () => {
    const towns = [
      { name: 'inside', lat: 0, lon: 0 },
      { name: 'ring-east', lat: 0.15, lon: 0.15 },
      { name: 'far', lat: 0, lon: 9 },
    ]
    // Box span 0.2 -> ring expands to +-0.2; ring-east sits in the band.
    const ring = neighborRing(towns, { west: -0.1, south: -0.1, east: 0.1, north: 0.1 })
    expect(ring.map((t) => t.name)).toEqual(['ring-east'])
  })

  it('SWR: stale entry serves last-known temp instantly, refresh runs in background', async () => {
    const now = 1_730_000_000_000
    let temp = 21.2
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => omPayload(temp) }))
    const bg: Promise<unknown>[] = []
    const sched = (p: Promise<unknown>) => void bg.push(p)

    const first = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now, prefetch: false, schedule: sched },
    )
    expect(first.temps).not.toEqual({})
    await Promise.all(bg)

    temp = -5 // upstream value moves while the cache sits there
    const stale = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now: now + CACHE_TTL_MS + 1, prefetch: false, schedule: sched },
    )
    // Served INSTANTLY from cache (last-known values), zero blocking calls;
    // the SWR refresh fires in the background (counted after awaiting it).
    expect(stale.temps).toEqual(first.temps)
    expect(stale.stale).toBe(false)
    await Promise.all(bg) // background revalidation lands
    expect(fetchImpl.mock.calls.length).toBe(2) // 1 initial + 1 SWR refresh
    const fresh = await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now: now + CACHE_TTL_MS + 2, prefetch: false, schedule: sched },
    )
    const tempValues = Object.values(fresh.temps) as number[]
    expect(tempValues.every((t) => Math.abs(t - (-5 * 9 / 5 + 32)) < 0.01)).toBe(true)
    expect(fetchImpl.mock.calls.length).toBe(2) // 1 initial + 1 SWR refresh, no more
  })

  it('neighbor-ring prefetch: serving a viewport quietly warms the ring', async () => {
    const now = 1_730_000_000_000
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, json: async () => omPayload(15) }
    })
    const bg: Promise<unknown>[] = []
    const sched = (p: Promise<unknown>) => void bg.push(p)

    await handleWeather(
      { ...SPRINGFIELD, zoom: 10 },
      { fetchImpl, now, schedule: sched },
    )
    await Promise.all(bg)
    // Ring town Grandview (just outside the tiny Springfield box) got warmed.
    expect(urls.some((u) => u.includes('latitude=39.8164&longitude=-89.6187'))).toBe(true)

    // Next pan to a bbox covering Grandview: served from cache, ZERO new calls.
    urls.length = 0
    const second = await handleWeather(
      { west: -89.63, south: 39.81, east: -89.61, north: 39.82, zoom: 10 },
      { fetchImpl, now, schedule: sched },
    )
    expect(second.temps['grandview-39.82--89.62']).toBeCloseTo(59, 1)
    await Promise.all(bg)
    expect(urls.filter((u) => u.includes('latitude=39.8164'))).toHaveLength(0)
  })

  it('prefetch is capped: <=50 ring towns per request, <=10 concurrent', async () => {
    const now = 1_730_000_000_000
    let inflight = 0
    let peak = 0
    const fetchImpl = vi.fn(async () => {
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 1))
      inflight--
      return { ok: true, json: async () => omPayload(15) }
    })
    const bg: Promise<unknown>[] = []
    await handleWeather(
      { west: -74.1, south: 40.6, east: -73.9, north: 40.8, zoom: 10 },
      { fetchImpl, now, schedule: (p) => bg.push(p) },
    )
    await Promise.all(bg)
    const total = fetchImpl.mock.calls.length
    expect(total).toBeLessThanOrEqual(MAX_TOWNS_PER_REQUEST + MAX_PREFETCH_TOWNS)
    expect(total).toBeGreaterThan(MAX_TOWNS_PER_REQUEST) // ring really fired
    expect(peak).toBeLessThanOrEqual(MAX_UPSTREAM_CONCURRENCY)
  })

  it('prefetchTowns dedupes against slugs already in flight', async () => {
    const now = 1_730_000_000_000
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchImpl = vi.fn(async () => {
      await gate
      return { ok: true, json: async () => omPayload(15) }
    })
    const towns = [
      { name: 'A', lat: 1, lon: 1 },
      { name: 'B', lat: 2, lon: 2 },
    ]
    const p1 = prefetchTowns(towns, fetchImpl, now)
    const p2 = prefetchTowns(towns, fetchImpl, now) // second wave sees them in flight
    release()
    await Promise.all([p1, p2])
    expect(fetchImpl.mock.calls.length).toBe(2) // not 4
  })

  it('ring prefetch skips towns with a FRESH cache entry (no pointless churn)', async () => {
    const now = 1_730_000_000_000
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, json: async () => omPayload(15) }
    })
    const bg: Promise<unknown>[] = []
    const sched = (p: Promise<unknown>) => void bg.push(p)

    // Warm the wide Springfield view (5 towns) + its ring.
    await handleWeather(
      { ...SPRINGFIELD_WIDE, zoom: 10 },
      { fetchImpl, now, schedule: sched },
    )
    await Promise.all(bg)
    urls.length = 0

    // Pan slightly east: ring overlaps already-fresh towns -> they are NOT refetched.
    await handleWeather(
      { west: -89.7, south: 39.75, east: -89.5, north: 39.85, zoom: 10 },
      { fetchImpl, now, schedule: sched },
    )
    await Promise.all(bg)
    for (const slug of ['springfield-39.8--89.64', 'jerome-39.77--89.68']) {
      const coord = slug === 'springfield-39.8--89.64' ? '39.8017' : '39.7676'
      expect(urls.filter((u) => u.includes(`latitude=${coord}`))).toHaveLength(0)
    }
  })
})

