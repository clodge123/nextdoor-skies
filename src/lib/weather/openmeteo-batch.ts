/**
 * L6 TOWN-WEATHER-BADGES — Open-Meteo batch client.
 *
 * Keyless POST to https://api.open-meteo.com/v1/batch, up to 1000 coordinates
 * per call (Open-Meteo batch limit). Viewport-bounded: only towns inside the
 * current map bounds (plus margin) are requested. Refresh cadence is the
 * ~5-minute window law (brief law 2): fetch per window, NEVER per pan.
 *
 * Determinism law (R17): no Math.random / Date.now / new Date anywhere in
 * this module. Timing comes from the injected scheduler; the fetch itself is
 * a pure request/response with an injectable fetchImpl for tests.
 */

export const OPEN_METEO_BATCH_URL = 'https://api.open-meteo.com/v1/batch'

/** Open-Meteo batch endpoint hard limit per call. */
export const MAX_BATCH_COORDS = 1000

/** Brief law 2: fetch per ~5-min window, NOT per pan. */
export const REFRESH_INTERVAL_MS = 5 * 60_000

export interface TownCoord {
  id: string
  name: string
  lat: number
  lon: number
}

export interface CurrentTemp {
  townId: string
  /** Celsius, straight from Open-Meteo `current.temperature_2m`. */
  temperatureC: number
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
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** One chunk of the batch POST body. */
export interface BatchRequestBody {
  batch: Array<{ latitude: number; longitude: number; current: string; timezone: string }>
}

/** Split towns into <=MAX_BATCH_COORDS chunks, preserving order. */
export function chunkTowns(towns: readonly TownCoord[], max = MAX_BATCH_COORDS): TownCoord[][] {
  if (max < 1) throw new Error(`chunkTowns: max must be >= 1, got ${max}`)
  const out: TownCoord[][] = []
  for (let i = 0; i < towns.length; i += max) {
    out.push(towns.slice(i, i + max))
  }
  return out
}

/** Build the POST body for one chunk: parallel arrays per Open-Meteo batch. */
export function buildBatchRequestBody(towns: readonly TownCoord[]): BatchRequestBody {
  return {
    batch: towns.map((t) => ({
      latitude: t.lat,
      longitude: t.lon,
      current: 'temperature_2m',
      timezone: 'UTC',
    })),
  }
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

interface OpenMeteoCurrent {
  current?: { temperature_2m?: number | null }
}

/**
 * Parse batch responses into temps keyed by town id. A chunk entry missing
 * its temperature (API hiccup, geocoding miss) yields NO entry — the badge
 * keeps its last value (last-data-wins law 3) and the surface stays honest
 * (R19: real data only, never a lookalike fallback).
 */
export function parseBatchResponse(
  payload: unknown,
  towns: readonly TownCoord[],
): CurrentTemp[] {
  const batch = (payload as { batch?: OpenMeteoCurrent[] })?.batch
  if (!Array.isArray(batch)) return []
  const out: CurrentTemp[] = []
  const n = Math.min(batch.length, towns.length)
  for (let i = 0; i < n; i++) {
    const temp = batch[i]?.current?.temperature_2m
    if (typeof temp === 'number' && Number.isFinite(temp)) {
      out.push({ townId: towns[i].id, temperatureC: temp })
    }
  }
  return out
}

/**
 * Fetch current temps for ALL given towns, chunked into <=1000-coord POSTs.
 * Returns the merged list; chunk order is preserved so parse pairing is safe.
 */
export async function fetchCurrentTemps(
  towns: readonly TownCoord[],
  fetchImpl: FetchImpl,
): Promise<CurrentTemp[]> {
  const results: CurrentTemp[] = []
  for (const chunk of chunkTowns(towns)) {
    const res = await fetchImpl(OPEN_METEO_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBatchRequestBody(chunk)),
    })
    if (!res.ok) {
      throw new Error(`open-meteo batch failed: HTTP ${res.status}`)
    }
    results.push(...parseBatchResponse(await res.json(), chunk))
  }
  return results
}

export interface WeatherRefresherOptions {
  getTowns: () => readonly TownCoord[]
  getViewport: () => GeoBounds
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
 * between windows never triggers a fetch (law 2). Last-data-wins: a failed
 * window leaves the previous temps untouched (law 3, R19).
 */
export function createWeatherRefresher(opts: WeatherRefresherOptions): {
  start: () => void
  stop: () => void
} {
  const intervalMs = opts.intervalMs ?? REFRESH_INTERVAL_MS
  const setInt = opts.setIntervalFn ?? setInterval
  const clearInt = opts.clearIntervalFn ?? clearInterval
  let timer: ReturnType<typeof setInterval> | null = null

  const runWindow = async (): Promise<void> => {
    const visible = filterVisibleTowns(opts.getTowns(), opts.getViewport())
    if (visible.length === 0) return
    try {
      const temps = await fetchCurrentTemps(visible, opts.fetchImpl)
      if (temps.length > 0) opts.onTemps(temps)
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
