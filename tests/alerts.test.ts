// S6 ALERTS-PROXY server function tests: bbox filter, FIPS cache (one points
// call per town ever), UA header presence, degradation to stale:true.
// Node env (api/ runs on Vercel); pragma keeps vitest's jsdom default away.
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alertsForZone,
  collectAlerts,
  countyZoneFor,
  NWS_USER_AGENT,
  parseBbox,
  resetAlertCaches,
  townsInBbox,
  zoneFromPoints,
} from '../api/alerts.js'

type NwsFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const TOWN = { name: 'Austin', lat: 30.2672, lon: -97.7431, pop: 950000, tier: 'city' }

function pointsPayload(county = 'https://api.weather.gov/zones/county/TXC453') {
  return { properties: { county } }
}

function alertsPayload(events: Array<Partial<Record<string, string>>> = []) {
  return {
    features: events.map((e) => ({
      properties: {
        id: e.id ?? 'urn:oid:test-1',
        event: e.event ?? 'Flood Warning',
        severity: e.severity ?? 'Severe',
        expires: e.expires ?? '2026-10-21T19:00:00-05:00',
        status: 'Actual',
        affectedZones: ['https://api.weather.gov/zones/county/TXC453'],
      },
    })),
  }
}

beforeEach(() => resetAlertCaches())

describe('parseBbox', () => {
  it('normalizes corner order and rejects junk', () => {
    expect(parseBbox('2,4,1,3')).toEqual({ west: 1, south: 3, east: 2, north: 4 })
    expect(parseBbox('1,2,3')).toBeNull()
    expect(parseBbox('a,2,3,4')).toBeNull()
    expect(parseBbox(undefined)).toBeNull()
  })
})

describe('townsInBbox (gazetteer semantics)', () => {
  const towns = [
    { name: 'Austin', lat: 30.27, lon: -97.74, pop: 1, tier: 'city' as const },
    { name: 'Houston', lat: 29.76, lon: -95.36, pop: 1, tier: 'city' as const },
  ]
  it('keeps only towns inside the window, inclusive', () => {
    expect(townsInBbox(towns, -98, 30, -97, 31).map((t) => t.name)).toEqual(['Austin'])
    expect(townsInBbox(towns, -97.74, 30.27, -97.74, 30.27).map((t) => t.name)).toEqual(['Austin'])
  })
})

describe('zoneFromPoints', () => {
  it('extracts the county zone id from the points payload', () => {
    expect(zoneFromPoints(pointsPayload())).toBe('TXC453')
    expect(zoneFromPoints(pointsPayload('https://api.weather.gov/zones/county/MOC515'))).toBe('MOC515')
    expect(zoneFromPoints({})).toBeNull()
    expect(zoneFromPoints(pointsPayload('https://example.com/nope'))).toBeNull()
  })
})

describe('NWS User-Agent law', () => {
  it('every upstream call carries the required UA header', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const fetchImpl = vi.fn(async (url: string, init?: { headers?: Record<string, string> }): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> => {
      calls.push({ url, headers: init?.headers ?? {} })
      if (url.includes('/points/')) return { ok: true, status: 200, json: async () => pointsPayload() }
      return { ok: true, status: 200, json: async () => alertsPayload() }
    }) satisfies NwsFetch
    await collectAlerts({ west: -97.8, south: 30.2, east: -97.7, north: 30.3 }, fetchImpl)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.headers['User-Agent']).toBe(NWS_USER_AGENT)
      expect(NWS_USER_AGENT).toMatch(/nextdoor-skies/)
    }
  })
})

describe('FIPS cache (one points call per town, ever)', () => {
  it('second lookup for the same town makes zero upstream calls', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => pointsPayload(),
    }))
    expect(await countyZoneFor(TOWN, fetchImpl)).toBe('TXC453')
    expect(await countyZoneFor(TOWN, fetchImpl)).toBe('TXC453')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a failed lookup is cached as a miss (no retry storm)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    expect(await countyZoneFor(TOWN, fetchImpl)).toBeNull()
    expect(await countyZoneFor(TOWN, fetchImpl)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('zone alerts cache TTL', () => {
  it('serves the cached list inside 5 min, refetches after', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => alertsPayload([{ id: 'a1' }]),
    }))
    const t0 = 1_000_000
    expect((await alertsForZone('TXC453', fetchImpl, t0)).alerts).toHaveLength(1)
    expect((await alertsForZone('TXC453', fetchImpl, t0 + 60_000)).alerts).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await alertsForZone('TXC453', fetchImpl, t0 + 5 * 60_000 + 1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('collectAlerts end-to-end (fake upstream)', () => {
  it('maps alerts onto town ids for badge dots', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/points/')) return { ok: true, status: 200, json: async () => pointsPayload() }
      return { ok: true, status: 200, json: async () => alertsPayload([{ id: 'a1', event: 'Flood Warning' }]) }
    })
    const { alerts, stale } = await collectAlerts({ west: -97.8, south: 30.2, east: -97.7, north: 30.3 }, fetchImpl)
    expect(stale).toBe(false)
    // Austin-metro bbox bakes 3 towns -> one entry per town for the shared alert.
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(new Set(alerts.map((a) => a.id))).toEqual(new Set(['a1']))
    expect(new Set(alerts.map((a) => a.town)).size).toBe(alerts.length)
    expect(alerts[0]).toMatchObject({
      id: 'a1',
      event: 'Flood Warning',
      severity: 'Severe',
    })
    expect(alerts.some((a) => a.town === 'austin-30.27--97.74')).toBe(true)
    expect(alerts[0].expires).toBeTruthy()
  })

  it('dedupes an alert shared across towns in the same zone', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/points/')) return { ok: true, status: 200, json: async () => pointsPayload() }
      return { ok: true, status: 200, json: async () => alertsPayload([{ id: 'shared' }]) }
    })
    // Two Austin-area towns in one tiny bbox -> same zone, same alert.
    const { alerts } = await collectAlerts({ west: -97.85, south: 30.15, east: -97.6, north: 30.4 }, fetchImpl)
    const perTown = new Set(alerts.map((a) => `${a.id}|${a.town}`))
    expect(perTown.size).toBe(alerts.length)
    const ids = alerts.map((a) => a.id)
    expect(new Set(ids).size).toBe(1)
  })

  it('empty bbox -> empty alerts, not stale', async () => {
    const fetchImpl = vi.fn()
    const { alerts, stale } = await collectAlerts({ west: 0, south: 0, east: 1, north: 1 }, fetchImpl)
    expect(alerts).toEqual([])
    expect(stale).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('caps at MAX_TOWNS_PER_REQUEST towns (heaviest first)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/points/')) return { ok: true, status: 200, json: async () => pointsPayload() }
      return { ok: true, status: 200, json: async () => alertsPayload([]) }
    })
    // bbox covering the whole baked US towns file.
    const { stale } = await collectAlerts({ west: -180, south: 17, east: -60, north: 72 }, fetchImpl)
    expect(stale).toBe(false)
    expect(fetchImpl.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/points/')).length).toBeLessThanOrEqual(50)
  })
})

describe('degradation (honest stale state)', () => {
  it('points failure -> stale:true, no crash, alerts empty', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/points/')) throw new Error('ECONNREFUSED')
      return { ok: true, status: 200, json: async () => alertsPayload() }
    })
    const { alerts, stale } = await collectAlerts({ west: -97.8, south: 30.2, east: -97.7, north: 30.3 }, fetchImpl)
    expect(alerts).toEqual([])
    expect(stale).toBe(true)
  })

  it('alerts endpoint failure -> stale:true with zones that resolved kept', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/points/')) return { ok: true, status: 200, json: async () => pointsPayload() }
      return { ok: false, status: 503, json: async () => ({}) }
    })
    const { alerts, stale } = await collectAlerts({ west: -97.8, south: 30.2, east: -97.7, north: 30.3 }, fetchImpl)
    expect(alerts).toEqual([])
    expect(stale).toBe(true)
  })

  it('non-Actual alerts (cancelled/expired) are dropped', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/points/')) return { ok: true, status: 200, json: async () => pointsPayload() }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          features: [{ properties: { id: 'x', event: 'Flood Warning', severity: 'Severe', status: 'Cancelled', affectedZones: [] } }],
        }),
      }
    })
    const { alerts } = await collectAlerts({ west: -97.8, south: 30.2, east: -97.7, north: 30.3 }, fetchImpl)
    expect(alerts).toEqual([])
  })
})
