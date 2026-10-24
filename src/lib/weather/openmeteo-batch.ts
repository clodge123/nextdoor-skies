/**
 * L6 TOWN-WEATHER-BADGES — weather-proxy client (wave-2 contract S5).
 *
 * The old client POSTed https://api.open-meteo.com/v1/batch, an endpoint that
 * does NOT exist (HTTP 404) — every badge sat on "awaiting feed" forever.
 * Per docs/WAVE-2-CONTRACTS.md §S5 the client now GETs the same-origin proxy
 * `/api/weather?bbox=lng1,lat1,lng2,lat2&zoom=n`, which fans out per-town
 * Open-Meteo /v1/forecast calls server-side (<=50 towns/request, 5-min TTL).
 *
 * Viewport-bounded: only towns inside the current map bounds (plus margin)
 * are requested, split into <=50-town chunks. Refresh cadence is the ~5-min
 * window law (brief law 2): fetch per window, NEVER per pan. Each window
 * ABORTS the previous in-flight request (pan-cancels-stale), so a response
 * for an old viewport can never land.
 *
 * Units: the proxy answers in Fahrenheit (contract S5); this client converts
 * to Celsius (CurrentTemp.temperatureC) so the badge pipeline downstream is
 * unchanged from the original Celsius design.
 *
 * Determinism law (R17): no RNG and no wall-clock reads anywhere in this
 * module. Timing comes from the injected scheduler; the fetch itself is
 * a pure request/response with an injectable fetchImpl for tests.
 *
 * W4-C1 FETCH-HYGIENE: requests route through lib/net.netFetch (10s
 * timeout, 1 retry, per-key abort of superseded windows).
 */
import { netFetch } from '../net'

/** Same-origin weather proxy (api/weather.js). Never a third-party origin. */
export const WEATHER_PROXY_PATH = '/api/weather'

/**
 * Server-side zoom gate (W4-BF single-gate law): equals the lowest
 * badge-visible zoom (1 — country-tier labels/badges render from z1), NOT
 * the old z9 badge gate. Mirrors api/weather.js MIN_ZOOM; any badge on
 * screen has an eligible feed. Density is bounded client-side (pop-top
 * <=50 towns per window) and server-side (MAX_TOWNS_PER_REQUEST).
 */
export const WEATHER_MIN_ZOOM = 1

/** Contract §S5: <=50 towns per proxy request. */
export const MAX_CHUNK_TOWNS = 50

/** Brief law 2: fetch per ~5-min window, NOT per pan. */
export const REFRESH_INTERVAL_MS = 5 * 60_000

export interface TownCoord {
  id: string
  name: string
  lat: number
  lon: number
  /** Population (W4-BF density law): when present, the refresher window
   *  sends the pop-top <=50 towns (deterministic: pop desc, id asc) so the
   *  map shows the biggest towns' weather first, like Google Maps tiering. */
  pop?: number
}

export interface CurrentTemp {
  townId: string
  /** Celsius, converted from the proxy's Fahrenheit `temps` values. */
  temperatureC: number
  /**
   * W3-A2: Open-Meteo WMO weathercode ("wmo code") for the town, when the
   * proxy carried real condition data. Undefined => no icon (honest, R19).
   */
  weathercode?: number
}

/** Geographic bounds in degrees. */
export interface GeoBounds {
  west: number
  south: number
  east: number
  north: number
}

/** Injectable fetch for tests (vitest) and the app (window.fetch). */
export type FetchImpl = (
  input: string,
  init: { method: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** Proxy URL for one viewport window; corners normalized to w,s,e,n. */
export function buildProxyUrl(viewport: GeoBounds, zoom: number): string {
  const w = Math.min(viewport.west, viewport.east)
  const e = Math.max(viewport.west, viewport.east)
  const s = Math.min(viewport.south, viewport.north)
  const n = Math.max(viewport.south, viewport.north)
  return `${WEATHER_PROXY_PATH}?bbox=${w},${s},${e},${n}&zoom=${zoom}`
}

/** Split towns into <=max chunks, preserving order. */
export function chunkTowns(towns: readonly TownCoord[], max = MAX_CHUNK_TOWNS): TownCoord[][] {
  if (max < 1) throw new Error(`chunkTowns: max must be >= 1, got ${max}`)
  const out: TownCoord[][] = []
  for (let i = 0; i < towns.length; i += max) {
    out.push(towns.slice(i, i + max))
  }
  return out
}

/**
 * Viewport culling: towns strictly inside bounds (expanded by marginDeg on
 * each side) survive. Keeps badge fetches bounded to what the user sees.
 */
export function filterVisibleTowns(
  towns: readonly TownCoord[],
  bounds: GeoBounds,
  marginDeg = 0.5,
): TownCoord[] {
  const w = bounds.west - marginDeg
  const e = bounds.east + marginDeg
  const s = bounds.south - marginDeg
  const n = bounds.north + marginDeg
  return towns.filter((t) => t.lon >= w && t.lon <= e && t.lat >= s && t.lat <= n)
}

/** Bounding box of a chunk of towns (the proxy request for that chunk). */
export function chunkBounds(towns: readonly TownCoord[]): GeoBounds {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const t of towns) {
    west = Math.min(west, t.lon)
    east = Math.max(east, t.lon)
    south = Math.min(south, t.lat)
    north = Math.max(north, t.lat)
  }
  return { west, south, east, north }
}

/**
 * Parse a proxy response `{ temps: { <townSlug>: tempF }, codes: { <townSlug>: wmoCode }, stale }`
 * into CurrentTemp entries for the towns we asked about (F -> C). A town
 * absent from `temps` (upstream hiccup, geocoding miss) yields NO entry — the
 * badge keeps its last value (last-data-wins law 3) and the surface stays
 * honest (R19: real data only, never a lookalike fallback). A town present in
 * `temps` but absent from `codes` gets the temp with NO weathercode — the
 * badge shows the temp and no icon (never a guessed condition).
 */
export function parseProxyResponse(
  payload: unknown,
  towns: readonly TownCoord[],
): CurrentTemp[] {
  const temps = (payload as { temps?: Record<string, unknown> })?.temps
  if (!temps || typeof temps !== 'object') return []
  const codes = (payload as { codes?: Record<string, unknown> })?.codes
  const out: CurrentTemp[] = []
  for (const t of towns) {
    const f = temps[t.id]
    if (typeof f === 'number' && Number.isFinite(f)) {
      const rawCode = codes && typeof codes === 'object' ? codes[t.id] : undefined
      const code = typeof rawCode === 'number' && Number.isFinite(rawCode) ? Math.trunc(rawCode) : undefined
      out.push({
        townId: t.id,
        temperatureC: ((f - 32) * 5) / 9,
        ...(code === undefined ? {} : { weathercode: code }),
      })
    }
  }
  return out
}

/**
 * Fetch current temps for ALL given towns via the proxy, chunked into
 * <=50-town GETs (contract §S5). One request per chunk, order preserved.
 * An aborted fetch (superseded window) rejects — the caller discards.
 *
 * W4-C1 FETCH-HYGIENE: each chunk GET routes through lib/net.netFetch
 * (10s timeout, 1 retry, per-key abort of superseded windows — Google
 * Maps rule). The refresher's own window signal aborts instantly (no
 * retry) when a newer window supersedes it, preserving last-data-wins.
 */
export async function fetchCurrentTemps(
  towns: readonly TownCoord[],
  fetchImpl: FetchImpl,
  zoom: number,
  signal?: AbortSignal,
): Promise<CurrentTemp[]> {
  const results: CurrentTemp[] = []
  for (const chunk of chunkTowns(towns)) {
    const url = buildProxyUrl(chunkBounds(chunk), zoom)
    const res = await netFetch(url, {
      key: `weather:${url}`,
      signal,
      fetchImpl: fetchImpl as unknown as (input: string, init?: RequestInit) => Promise<Response>,
    })
    if (!res.ok) {
      throw new Error(`weather proxy failed: HTTP ${res.status}`)
    }
    results.push(...parseProxyResponse(await res.json(), chunk))
  }
  return results
}

export interface WeatherRefresherOptions {
  getTowns: () => readonly TownCoord[]
  getViewport: () => GeoBounds
  /** Current map zoom, forwarded to the proxy. Defaults to the gate (9). */
  getZoom?: () => number
  fetchImpl: FetchImpl
  /** Called with the latest temps whenever a window fetch succeeds. */
  onTemps: (temps: CurrentTemp[]) => void
  /** Window cadence; defaults to REFRESH_INTERVAL_MS (5 min). */
  intervalMs?: number
  /** Test seam for setInterval/clearInterval. */
  setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void
}

/**
 * Viewport-bounded, window-driven refresher. Fetches once immediately, then
 * on every 5-min window using the viewport CURRENT AT THAT MOMENT — panning
 * between windows never triggers a fetch (law 2). Each window ABORTS the
 * previous in-flight request, so a response for an old viewport can never
 * land (pan-cancels-stale). Last-data-wins: a failed/aborted window leaves
 * the previous temps untouched (law 3, R19).
 */
export function createWeatherRefresher(opts: WeatherRefresherOptions): {
  start: () => void
  stop: () => void
} {
  const intervalMs = opts.intervalMs ?? REFRESH_INTERVAL_MS
  const getZoom = opts.getZoom ?? (() => WEATHER_MIN_ZOOM)
  const setInt = opts.setIntervalFn ?? setInterval
  const clearInt = opts.clearIntervalFn ?? clearInterval
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight: AbortController | null = null

  const runWindow = async (): Promise<void> => {
    const visible = filterVisibleTowns(opts.getTowns(), opts.getViewport())
    if (visible.length === 0) return
    // W4-BF DENSITY LAW: a window asks for at most MAX_CHUNK_TOWNS towns,
    // pop-desc (id asc on ties) — the biggest towns in view load first, the
    // rest arrive next window. Bounded request, bounded clutter, deterministic.
    const served =
      visible.length <= MAX_CHUNK_TOWNS
        ? visible
        : [...visible]
            .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0) || a.id.localeCompare(b.id))
            .slice(0, MAX_CHUNK_TOWNS)
    // Pan-cancels-stale: this window supersedes any older in-flight request.
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    try {
      const temps = await fetchCurrentTemps(served, opts.fetchImpl, getZoom(), controller.signal)
      if (controller.signal.aborted) return
      if (temps.length > 0) opts.onTemps(temps)
    } catch {
      // Window failed/aborted: keep last data (law 3). Never flip the UI.
    } finally {
      if (inFlight === controller) inFlight = null
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
      inFlight?.abort()
      inFlight = null
    },
  }
}
