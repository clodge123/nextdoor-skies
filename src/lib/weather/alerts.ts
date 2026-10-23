/**
 * S6 ALERTS-PROXY — client hook for /api/alerts (server function api/alerts.js).
 *
 * Fetch-per-window law (brief law 2): alerts are polled per ~5-min window
 * against the viewport bbox CURRENT AT THAT MOMENT — panning inside a window
 * never triggers a fetch. Last-data-wins: a failed poll leaves the previous
 * alerts untouched (honest state, R19 — real NWS data only, never a lookalike).
 *
 * Determinism (R17): no Math.random / Date.now / new Date in this module.
 * Timing comes from the injected scheduler; the fetch is injectable for tests.
 *
 * W4-C1 FETCH-HYGIENE: fetches route through lib/net.netFetch (10s timeout,
 * 1 retry, per-key 'alerts' abort of superseded windows — wave-4 session 2
 * law 2). Last-data-wins unchanged: failures/aborts never flip the UI.
 */
import { netFetch } from '../net'

export const ALERTS_REFRESH_INTERVAL_MS = 5 * 60_000

export interface Alert {
  id: string
  event: string
  town: string
  severity: string
  expires: string | null
  /** Optional NWS passthrough (W3-C2): headline/summary/effective when the
   *  upstream feature carries them — absent for zone-only stubs, never faked. */
  headline?: string
  summary?: string
  effective?: string | null
}

/** Geographic bounds in degrees (same shape as openmeteo-batch GeoBounds). */
export interface AlertBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface AlertsResponse {
  alerts: Alert[]
  stale?: boolean
}

export type AlertsFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<AlertsResponse> }>

/** Build the /api/alerts URL for a viewport bbox (pure, test-visible). */
export function alertsUrl(bounds: AlertBounds): string {
  return `/api/alerts?bbox=${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
}

/**
 * One poll: GET the endpoint, return the list + stale flag. Non-OK responses
 * throw so the refresher can keep last data (law 3).
 */
export async function fetchAlerts(
  bounds: AlertBounds,
  fetchImpl: AlertsFetch,
): Promise<AlertsResponse> {
  // W4-C1 FETCH-HYGIENE: route through netFetch (10s timeout, 1 retry,
  // per-key abort of superseded windows — Google Maps rule). A failed window
  // throws so the refresher keeps last data (law 3); an aborted window
  // rejects via AbortError (the refresher discards it).
  const res = await netFetch(alertsUrl(bounds), {
    key: 'alerts',
    fetchImpl: fetchImpl as unknown as (input: string, init?: RequestInit) => Promise<Response>,
  })
  if (!res.ok) throw new Error(`alerts fetch failed: HTTP ${res.status}`)
  const payload = await res.json()
  if (!Array.isArray(payload?.alerts)) throw new Error('alerts fetch failed: bad payload')
  return { alerts: payload.alerts, stale: payload.stale === true }
}

/**
 * Badge alert-dot logic (contract S6 consumer seam): town slug -> highest
 * active severity for that town, or null when the town has no alerts.
 * Severity rank is a fixed deterministic table; unknown severities rank
 * below known ones so a real severity always wins.
 */
export const SEVERITY_RANK: Record<string, number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
}

/**
 * W3-C2 ALERT CENTER — severity sort (Extreme > Severe > Moderate > Minor).
 * Deterministic: fixed SEVERITY_RANK table, ties broken by id ascending.
 * Stable across renders (pure, clock/RNG-free).
 */
export function sortAlertsBySeverity(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const rank = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    if (rank !== 0) return rank
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function alertDotForTown(alerts: readonly Alert[], townSlug: string): string | null {
  let best: string | null = null
  for (const alert of alerts) {
    if (alert.town !== townSlug) continue
    if (
      best === null ||
      (SEVERITY_RANK[alert.severity] ?? 0) > (SEVERITY_RANK[best] ?? 0)
    ) {
      best = alert.severity
    }
  }
  return best
}

export interface AlertsRefresherOptions {
  getViewport: () => AlertBounds
  fetchImpl: AlertsFetch
  /** Latest { alerts, stale } whenever a window poll succeeds. */
  onAlerts: (payload: AlertsResponse) => void
  intervalMs?: number
  /** Test seam for setInterval/clearInterval. */
  setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void
}

/**
 * Viewport-bounded, window-driven alerts refresher — same cadence law as the
 * weather refresher: fetch once immediately, then per 5-min window using the
 * viewport current at that moment. A failed window keeps prior data (law 3);
 * the UI never flips to an error wall.
 */
export function createAlertsRefresher(opts: AlertsRefresherOptions): {
  start: () => void
  stop: () => void
} {
  const intervalMs = opts.intervalMs ?? ALERTS_REFRESH_INTERVAL_MS
  const setInt = opts.setIntervalFn ?? setInterval
  const clearInt = opts.clearIntervalFn ?? clearInterval
  let timer: ReturnType<typeof setInterval> | null = null

  const runWindow = async (): Promise<void> => {
    try {
      const payload = await fetchAlerts(opts.getViewport(), opts.fetchImpl)
      opts.onAlerts(payload)
    } catch {
      // Window failed: keep last data (law 3). Never flip the UI to error.
    }
  }

  return {
    start() {
      if (timer !== null) return
      void runWindow()
      timer = setInt(() => void runWindow(), intervalMs)
    },
    stop() {
      if (timer !== null) {
        clearInt(timer)
        timer = null
      }
    },
  }
}
