// S6 ALERTS-PROXY client tests: URL law, fetch mapping, alert-dot severity,
// window cadence (fetch per window, never per pan), last-data-wins.
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  alertDotForTown,
  alertsUrl,
  createAlertsRefresher,
  fetchAlerts,
  type Alert,
  type AlertsFetch,
} from '../src/lib/weather/alerts'

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: 'urn:oid:1',
    event: 'Flood Warning',
    town: 'austin-30.27--97.74',
    severity: 'Severe',
    expires: '2026-10-21T19:00:00-05:00',
    ...over,
  }
}

describe('alertsUrl', () => {
  it('encodes the viewport bbox in contract order', () => {
    expect(alertsUrl({ west: -97.8, south: 30.2, east: -97.7, north: 30.3 })).toBe(
      '/api/alerts?bbox=-97.8,30.2,-97.7,30.3',
    )
  })
})

describe('fetchAlerts', () => {
  it('maps payload alerts + stale flag', async () => {
    const fetchImpl: AlertsFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ alerts: [alert()], stale: true }),
    }))
    const res = await fetchAlerts({ west: 1, south: 2, east: 3, north: 4 }, fetchImpl)
    expect(res.alerts).toHaveLength(1)
    expect(res.stale).toBe(true)
  })

  it('throws on non-OK so the refresher keeps last data', async () => {
    const fetchImpl: AlertsFetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
    }))
    await expect(fetchAlerts({ west: 1, south: 2, east: 3, north: 4 }, fetchImpl)).rejects.toThrow(/502/)
  })

  it('throws on malformed payload (no fake empty success)', async () => {
    const fetchImpl: AlertsFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ notAlerts: [] }),
    }))
    await expect(fetchAlerts({ west: 1, south: 2, east: 3, north: 4 }, fetchImpl)).rejects.toThrow(/bad payload/)
  })
})

describe('alertDotForTown (badge dot logic)', () => {
  const alerts = [
    alert({ id: 'a', severity: 'Minor' }),
    alert({ id: 'b', severity: 'Extreme' }),
    alert({ id: 'c', town: 'houston-29.76--95.36', severity: 'Severe' }),
  ]
  it('returns the highest severity active for the town slug', () => {
    expect(alertDotForTown(alerts, 'austin-30.27--97.74')).toBe('Extreme')
  })
  it('null when the town has no alerts', () => {
    expect(alertDotForTown(alerts, 'dallas-32.78--96.8')).toBeNull()
  })
  it('Unknown ranks below any real severity', () => {
    expect(alertDotForTown([alert({ severity: 'Unknown' }), alert({ id: 'x', severity: 'Minor' })], 'austin-30.27--97.74')).toBe('Minor')
  })
})

describe('createAlertsRefresher (fetch-per-window law)', () => {
  // Drain the full async chain (fetch -> json -> onAlerts) of one window.
  const flush = () => new Promise((r) => setTimeout(r, 0))

  function makeTimer() {
    let cb: (() => void) | null = null
    const capturedMs = { value: 0 }
    return {
      capturedMs,
      setIntervalFn: (fn: () => void, ms: number) => {
        cb = fn
        capturedMs.value = ms
        return 1 as unknown as ReturnType<typeof setInterval>
      },
      clearIntervalFn: vi.fn(() => {
        cb = null
      }),
      fire: () => cb?.(),
    }
  }

  it('fetches once on start and once per window tick — never per pan', async () => {
    const timer = makeTimer()
    let bounds = { west: 0, south: 0, east: 1, north: 1 }
    const fetchImpl: AlertsFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ alerts: [alert()] }),
    }))
    const seen: string[] = []
    const refresher = createAlertsRefresher({
      getViewport: () => bounds,
      fetchImpl,
      onAlerts: (p) => seen.push(p.alerts[0]?.id ?? '-'),
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    })
    refresher.start()
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // Pan inside the window: zero fetches.
    bounds = { west: 10, south: 10, east: 11, north: 11 }
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // Window boundary: fetches with the CURRENT viewport.
    timer.fire()
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    // W4-C1: fetches route through lib/net.netFetch, which passes a
    // RequestInit (method GET) alongside the URL — same URL, richer init.
    expect(fetchImpl).toHaveBeenLastCalledWith(
      '/api/alerts?bbox=10,10,11,11',
      expect.objectContaining({ method: 'GET' }),
    )
    refresher.stop()
    timer.fire()
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('failed window keeps last data (law 3, honest state)', async () => {
    const timer = makeTimer()
    let fail = false
    const fetchImpl: AlertsFetch = vi.fn(async () =>
      fail ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ alerts: [alert()] }) },
    )
    const received: string[] = []
    const refresher = createAlertsRefresher({
      getViewport: () => ({ west: 0, south: 0, east: 1, north: 1 }),
      fetchImpl,
      onAlerts: (p) => received.push(p.alerts[0]?.id ?? '-'),
      setIntervalFn: timer.setIntervalFn,
      clearIntervalFn: timer.clearIntervalFn,
    })
    refresher.start()
    await flush() // let runWindow's promise chain settle
    expect(received).toEqual(['urn:oid:1'])
    fail = true
    timer.fire()
    await flush()
    expect(received).toEqual(['urn:oid:1']) // unchanged, not wiped
  })
})
