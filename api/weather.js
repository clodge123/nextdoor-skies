// W3-A1 WEATHER-CACHE (wave-3 session-1 law) — GET /api/weather?bbox=lng1,lat1,lng2,lat2&zoom=n
// -> { temps: { <townSlug>: tempF }, stale: boolean }
//
// Wave-3 upgrade (docs/WAVE-3-BRAINSTORM.md session 1, decision 1):
//   "60-minute town cache, server-side, stale-while-revalidate. Cache warms
//    by gathering everything in view; users scrolling pull from the cache,
//    the next ring prefetches quietly. No visible 'awaiting feed' for seen
//    towns."
//
// Concretely this file now provides:
//   1. 60-minute in-memory town cache (slug-keyed).
//   2. Stale-while-revalidate (SWR): a cache hit ALWAYS serves the last-known
//      temp instantly (fresh OR stale); when the entry is past its 60-min
//      expiry the server kicks off a quiet background refresh that updates
//      the cache for the next request. A seen town never blocks on upstream.
//   3. Neighbor-ring prefetch: when serving a viewport bbox, the ring of
//      towns just OUTSIDE that bbox is prefetched quietly (fire-and-forget,
//      <=50 towns/request, <=10 concurrent upstream) so the next pan is
//      already warm.
//
// Contract shape {temps:{slug:F}, stale} and the zoom-9 gate are UNCHANGED
// (wave-2 S5 law). The client (src/lib/weather/openmeteo-batch.ts) keeps
// fetch-per-window; all caching lives server-side.
//
// LAWS honored here:
// - R17 determinism: no Math.random / new Date. Date.now appears ONLY as the
//   injectable clock default (documented exception, per lane brief). All
//   ordering is data-order (pop desc from the baked geonames dump), never RNG.
// - Graceful degradation (R19 honest states): a town whose upstream call
//   fails is ABSENT from temps (fresh hit) or keeps its last-known value
//   (stale hit) — we never invent a lookalike temp.
// - Budget: <=50 towns served per request, <=50 towns prefetched per request,
//   <=10 upstream calls in flight per request/per-prefetch-batch.
// - Serverless budget: api/ holds probe.js + this file = 2 functions (<=12).
//
// NOTE (contract deviation, documented in W1): the brief says "use
// lib/map/gazetteer helpers". The serverless runtime executes plain .js;
// src/lib/map/gazetteer.ts is TypeScript and cannot be imported here without
// a bundling step. The gazetteer helpers are tiny pure functions, so
// townsInBbox/slugify/townId below are exact mirrors kept in sync manually.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const UPSTREAM_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
/** Contract §S5: <=50 towns per request. */
export const MAX_TOWNS_PER_REQUEST = 50
/** Contract §S5: <=10 upstream calls per request (in-flight concurrency). */
export const MAX_UPSTREAM_CONCURRENCY = 10
/** Wave-3 session-1 law: 60-minute town cache. */
export const CACHE_TTL_MS = 60 * 60_000
/** Neighbor-ring prefetch budget: <=50 towns per prefetch batch. */
export const MAX_PREFETCH_TOWNS = 50
/** Ring thickness: expand the viewport by this factor on every side. */
export const PREFETCH_RING_FACTOR = 1
/** Zoom gate (matches TOWN_BADGE_MIN_ZOOM on main). */
export const MIN_ZOOM = 9
/** Per-town upstream timeout; slow towns degrade to absent, not a hung request. */
export const UPSTREAM_TIMEOUT_MS = 4000

// ---------------------------------------------------------------------------
// Pure helpers (mirrors of src/lib/map/gazetteer.ts + src/pages/MapPage.tsx)
// ---------------------------------------------------------------------------

/** Lowercase, non-alnum -> single dash, trimmed. Identical to MapPage.slugify. */
export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Stable town id: slug + rounded coords (2dp). Identical to MapPage.townId. */
export function townId(name, lat, lon) {
  return `${slugify(name)}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`
}

/** Towns inside a lon/lat bbox. Identical to gazetteer.townsInBbox. */
export function townsInBbox(towns, west, south, east, north) {
  return towns.filter(
    (t) => t.lon >= west && t.lon <= east && t.lat >= south && t.lat <= north,
  )
}

/**
 * The neighbor ring: expand each bbox side by factor*span, drop the towns
 * already inside the original bbox. Deterministic (data order), pure.
 */
export function neighborRing(towns, bbox, factor = PREFETCH_RING_FACTOR) {
  const dx = (bbox.east - bbox.west) * factor
  const dy = (bbox.north - bbox.south) * factor
  const ring = townsInBbox(towns, bbox.west - dx, bbox.south - dy, bbox.east + dx, bbox.north + dy)
  return ring.filter((t) => !(t.lon >= bbox.west && t.lon <= bbox.east && t.lat >= bbox.south && t.lat <= bbox.north))
}

/** Parse "GET /api/weather?bbox=lng1,lat1,lng2,lat2&zoom=n". Nulls = invalid. */
export function parseWeatherQuery(searchParams) {
  const bboxRaw = searchParams.get('bbox')
  const zoomRaw = searchParams.get('zoom')
  if (!bboxRaw || !zoomRaw) return null
  const parts = bboxRaw.split(',').map(Number)
  const zoom = Number(zoomRaw)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || !Number.isFinite(zoom)) {
    return null
  }
  const [lng1, lat1, lng2, lat2] = parts
  return {
    west: Math.min(lng1, lng2),
    east: Math.max(lng1, lng2),
    south: Math.min(lat1, lat2),
    north: Math.max(lat1, lat2),
    zoom,
  }
}

/** Split into chunks of <=size, order preserved. */
export function chunkArray(items, size) {
  if (size < 1) throw new Error(`chunkArray: size must be >= 1, got ${size}`)
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---------------------------------------------------------------------------
// Town data (lazy, module-level singleton; 1.6 MB geonames bake)
// ---------------------------------------------------------------------------

let townsCache = null
export function loadTowns() {
  if (townsCache === null) {
    townsCache = JSON.parse(readFileSync(townsFilePath(), 'utf8')).towns
  }
  return townsCache
}

/**
 * Resolve the baked town file. Vercel serverless: module-relative file: URL.
 * Vitest (jsdom rewrites import.meta.url): fall back to the repo-root cwd,
 * which is the project root in both environments.
 */
function townsFilePath() {
  const u = new URL('../data/towns/us-towns.json', import.meta.url)
  if (u.protocol === 'file:') return fileURLToPath(u)
  return resolve(process.cwd(), 'data/towns/us-towns.json')
}

/** Test seam: drop the parsed town list. */
export function resetTownsCache() {
  townsCache = null
}

// ---------------------------------------------------------------------------
// Town-keyed cache (in-memory, TTL 60 min, SWR). Date.now lives HERE ONLY
// as the injectable clock default (documented R17 exception).
// ---------------------------------------------------------------------------

const tempCache = new Map() // slug -> { tempF, expiresAt }

/** Test seam: clear the temperature cache. */
export function resetWeatherCache() {
  tempCache.clear()
  inFlight.clear()
}

/**
 * SWR read: { tempF, state: 'fresh' } before expiry, { tempF, state: 'stale' }
 * after expiry (value kept — last-data-wins), undefined on a true miss.
 */
export function cacheGet(slug, now) {
  const hit = tempCache.get(slug)
  if (!hit) return undefined
  return { tempF: hit.tempF, state: now < hit.expiresAt ? 'fresh' : 'stale' }
}

export function cacheSet(slug, tempF, now) {
  tempCache.set(slug, { tempF, expiresAt: now + CACHE_TTL_MS })
}

/** Slug set currently being fetched (served request OR prefetch) — dedupe. */
const inFlight = new Set()

/** Test seam: slugs with an upstream call in flight right now. */
export function inFlightSlugs() {
  return new Set(inFlight)
}

// ---------------------------------------------------------------------------
// Upstream fan-out
// ---------------------------------------------------------------------------

export function forecastUrl(lat, lon) {
  return (
    `${UPSTREAM_FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m&units=imperial'
  )
}

/**
 * Normalize an Open-Meteo current-temperature reading to Fahrenheit. Live
 * probe (2026-10-21): the documented `units=imperial` param is a NO-OP on
 * /v1/forecast — the API answers in Celsius and labels it in
 * `current_units.temperature_2m`. We TRUST THE RESPONSE LABEL, not the
 * request param (R19 honesty): °C -> convert, °F -> passthrough, anything
 * else -> undefined (degrade, never guess).
 */
export function normalizeTempF(payload) {
  const t = payload?.current?.temperature_2m
  if (typeof t !== 'number' || !Number.isFinite(t)) return undefined
  const unit = payload?.current_units?.temperature_2m
  if (unit === '°F') return t
  if (unit === '°C') return (t * 9) / 5 + 32
  return undefined
}

/**
 * Fetch one town's current temp (Fahrenheit). Returns a finite number, or
 * undefined on ANY failure (HTTP error, timeout, malformed payload) — the
 * degradation path. No fake values, ever (R19).
 */
export async function fetchTownTemp(town, fetchImpl, signal) {
  try {
    const res = await fetchImpl(forecastUrl(town.lat, town.lon), {
      method: 'GET',
      signal,
    })
    if (!res.ok) return undefined
    return normalizeTempF(await res.json())
  } catch {
    return undefined
  }
}

/**
 * Run `jobs` (thunks) with at most `concurrency` in flight. Order-preserving
 * results array. Pure scheduling — no timers, no RNG.
 */
export async function mapWithConcurrency(jobs, concurrency) {
  const results = new Array(jobs.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    async () => {
      for (;;) {
        const i = next++
        if (i >= jobs.length) return
        results[i] = await jobs[i]()
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * Warm a set of towns in the background: fetch each (deduped against
 * in-flight slugs), write successes to the cache. <=MAX_PREFETCH_TOWNS towns,
 * <=MAX_UPSTREAM_CONCURRENCY in flight. Never throws — a failed prefetch
 * simply leaves the town uncached for the next request.
 */
export async function prefetchTowns(towns, fetchImpl, now) {
  const targets = towns.slice(0, MAX_PREFETCH_TOWNS)
  const jobs = targets
    .filter((t) => !inFlight.has(townId(t.name, t.lat, t.lon)))
    .map((t) => async () => {
      const slug = townId(t.name, t.lat, t.lon)
      if (inFlight.has(slug)) return false
      inFlight.add(slug)
      try {
        const tempF = await fetchTownTemp(t, fetchImpl, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
        if (tempF !== undefined) cacheSet(slug, tempF, now)
        return tempF !== undefined
      } finally {
        inFlight.delete(slug)
      }
    })
  return mapWithConcurrency(jobs, MAX_UPSTREAM_CONCURRENCY)
}

// ---------------------------------------------------------------------------
// Request core (pure-ish: fetch + clock + scheduler injectable for tests)
// ---------------------------------------------------------------------------

/**
 * Handle one weather request.
 * @returns {Promise<{temps: Record<string, number>, stale: boolean}>}
 *   stale=true only when towns were in scope and NOT ONE temp could be served
 *   (fresh or cached) — an honest "the feed is down" signal, never a lie.
 *
 * opts.now: injectable clock (tests never touch Date.now).
 * opts.schedule: seam for background work (SWR refresh + ring prefetch).
 *   Default: fire-and-forget (Vercel keeps the function warm to completion).
 *   Tests inject `(p) => promises.push(p)` and await the promises.
 * opts.prefetch: set false to disable the neighbor-ring prefetch (tests that
 *   want to isolate the served path); production always prefetches.
 */
export async function handleWeather(query, opts = {}) {
  const {
    fetchImpl = fetch,
    now = Date.now,
    concurrency = MAX_UPSTREAM_CONCURRENCY,
    prefetch = true,
    schedule = (p) => {
      void Promise.resolve(p).catch(() => {})
    },
  } = opts
  const { west, south, east, north, zoom } = query
  if (zoom < MIN_ZOOM) return { temps: {}, stale: false }

  const towns = loadTowns()
  const inBox = townsInBbox(towns, west, south, east, north)
  const served = inBox.slice(0, MAX_TOWNS_PER_REQUEST) // data order = pop desc, deterministic

  const misses = []
  const temps = {}
  const staleEntries = []
  for (const t of served) {
    const slug = townId(t.name, t.lat, t.lon)
    const hit = cacheGet(slug, now)
    if (hit) {
      temps[slug] = hit.tempF // fresh OR stale: serve last-known instantly
      if (hit.state === 'stale') staleEntries.push({ slug, town: t })
    } else {
      misses.push({ slug, town: t })
    }
  }

  const jobs = misses.map(({ slug, town }) => async () => {
    if (inFlight.has(slug)) return false
    inFlight.add(slug)
    try {
      const tempF = await fetchTownTemp(town, fetchImpl, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
      if (tempF !== undefined) {
        cacheSet(slug, tempF, now)
        temps[slug] = tempF
      }
      return tempF !== undefined
    } finally {
      inFlight.delete(slug)
    }
  })
  await mapWithConcurrency(jobs, concurrency)

  // SWR background refresh: stale entries were served instantly; re-fetch
  // them quietly so the next request is fresh. Fire-and-forget.
  if (staleEntries.length > 0) {
    schedule(refreshEntries(staleEntries, fetchImpl, now))
  }

  // Neighbor-ring prefetch: towns just outside the viewport, quiet, capped.
  if (prefetch) {
    const servedSlugs = new Set(served.map((t) => townId(t.name, t.lat, t.lon)))
    const ring = neighborRing(towns, { west, south, east, north }).filter(
      (t) => !servedSlugs.has(townId(t.name, t.lat, t.lon)),
    )
    const ringTargets = ring.filter((t) => {
      const slug = townId(t.name, t.lat, t.lon)
      const hit = cacheGet(slug, now)
      return !(hit && hit.state === 'fresh')
    })
    if (ringTargets.length > 0) {
      schedule(prefetchTowns(ringTargets, fetchImpl, now))
    }
  }

  const servedCount = Object.keys(temps).length
  const stale = served.length > 0 && servedCount === 0
  return { temps, stale }
}

/** SWR revalidation: refetch stale entries, update cache, never block. */
async function refreshEntries(entries, fetchImpl, now) {
  const jobs = entries.map(({ slug, town }) => async () => {
    if (inFlight.has(slug)) return false
    inFlight.add(slug)
    try {
      const tempF = await fetchTownTemp(town, fetchImpl, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
      if (tempF !== undefined) cacheSet(slug, tempF, now)
      return tempF !== undefined
    } finally {
      inFlight.delete(slug)
    }
  })
  return mapWithConcurrency(jobs, MAX_UPSTREAM_CONCURRENCY)
}

// ---------------------------------------------------------------------------
// Vercel function entry
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method not allowed' })
  }
  const params = new URL(req.url, 'http://internal').searchParams
  const query = parseWeatherQuery(params)
  if (query === null) {
    return res.status(400).json({ error: 'bbox=lng1,lat1,lng2,lat2&zoom=n required' })
  }
  try {
    const out = await handleWeather(query)
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.status(200).json(out)
  } catch (err) {
    // Unexpected blow-up: honest empty + stale, never a crash-to-500 for the UI.
    return res.status(200).json({ temps: {}, stale: true, error: String(err?.message ?? err) })
  }
}
