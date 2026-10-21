/**
 * W1 weather proxy (api/weather.js) — server-function unit tests:
 * query parsing, zoom gate, 50-town cap, concurrency cap, town-keyed
 * cache TTL, graceful degradation, unit normalization.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TOWNS_PER_REQUEST,
  MAX_UPSTREAM_CONCURRENCY,
  CACHE_TTL_MS,
  MIN_ZOOM,
  UPSTREAM_FORECAST_URL,
  chunkArray,
  forecastUrl,
  handleWeather,
  mapWithConcurrency,
  normalizeTempF,
  parseWeatherQuery,
  resetWeatherCache,
  slugify,
  townId,
  townsInBbox,
} from '../api/weather.js'

// Contains exactly the baked Springfield, IL (39.8017, -89.6437).
const SPRINGFIELD = { west: -89.66, south: 39.8, east: -89.63, north: 39.81 }

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
    const out = await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl })
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
      { fetchImpl },
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
    await handleWeather({ west: -74.1, south: 40.6, east: -73.9, north: 40.8, zoom: 10 }, { fetchImpl })
    expect(peak).toBeLessThanOrEqual(MAX_UPSTREAM_CONCURRENCY)
  })

  it('town-keyed cache: second request within TTL makes ZERO upstream calls', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => omPayload(21.2) }))
    const now = 1_730_000_000_000
    const first = await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl, now })
    const callsAfterFirst = fetchImpl.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const second = await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl, now: now + 1000 })
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst) // no new calls
    expect(second.temps).toEqual(first.temps)

    // TTL expiry: after 5 min the towns are refetched.
    await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl, now: now + CACHE_TTL_MS + 1 })
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst * 2)
  })

  it('graceful degradation: failed towns are absent, not faked (R19)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('-89.6437')) return { ok: true, json: async () => omPayload(21.2) }
      return { ok: false, status: 503, json: async () => ({}) }
    })
    const out = await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl })
    const springfield = Object.entries(out.temps).filter(([s]) => s.startsWith('springfield'))
    expect(springfield.length).toBe(1)
    expect(out.stale).toBe(false)
  })

  it('all towns failing -> stale=true, temps empty (honest, never fake)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    const out = await handleWeather({ ...SPRINGFIELD, zoom: 10 }, { fetchImpl })
    expect(out.temps).toEqual({})
    expect(out.stale).toBe(true)
  })
})
