// W1 WEATHER-PROXY (wave-2 contract S5) — GET /api/weather?bbox=lng1,lat1,lng2,lat2&zoom=n
// -> { temps: { <townSlug>: tempF }, stale: boolean }
//
// Why this exists: the client used to POST https://api.open-meteo.com/v1/batch,
// an endpoint that does NOT exist (HTTP 404) — every badge sat on
// "awaiting feed" forever. Per docs/WAVE-2-CONTRACTS.md §S5 the browser now
// asks this proxy; the proxy fans out per-town
// GET https://api.open-meteo.com/v1/forecast?...&current=temperature_2m&units=imperial
// calls (the endpoint proven alive by the live-egress assertion).
//
// LAWS honored here:
// - R17 determinism: no Math.random / new Date. Date.now appears ONLY for
//   cache expiry (the one documented exception, per lane brief). All ordering
//   is data-order (pop desc from the baked geonames dump), never RNG.
// - Graceful degradation (R19 honest states): a town whose upstream call
//   fails is simply ABSENT from temps — the badge keeps "awaiting feed"
//   (last-data-wins), we never invent a lookalike temp.
// - Budget: <=50 towns served per request (data order, deterministic),
//   <=10 upstream calls in flight per request (concurrency cap).
// - Serverless budget: api/ holds probe.js + this file = 2 functions (<=12).
//
// NOTE (contract deviation, documented): the brief says "use lib/map/gazetteer
// helpers". The serverless runtime executes plain .js; src/lib/map/gazetteer.ts
// is TypeScript and cannot be imported here without a bundling step. The
// gazetteer helpers are tiny pure functions, so townsInBbox/slugify/townId
// below are exact mirrors of src/lib/map/gazetteer.ts and src/pages/MapPage.tsx
// (kept in sync manually — behavior is identical).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const UPSTREAM_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
/** Contract §S5: <=50 towns per request. */
export const MAX_TOWNS_PER_REQUEST = 50
/** Contract §S5: <=10 upstream calls per request (in-flight concurrency). */
export const MAX_UPSTREAM_CONCURRENCY = 10
/** Cache TTL: ~5 minutes, keyed by town slug. */
export const CACHE_TTL_MS = 5 * 60_000
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
// Town-keyed cache (in-memory, TTL 5 min). Date.now lives HERE ONLY (documented).
// ---------------------------------------------------------------------------

const tempCache = new Map() // slug -> { tempF, expiresAt }

/** Test seam: clear the temperature cache. */
export function resetWeatherCache() {
  tempCache.clear()
}

export function cacheGet(slug, now) {
  const hit = tempCache.get(slug)
  if (hit && now < hit.expiresAt) return hit.tempF
  return undefined
}

export function cacheSet(slug, tempF, now) {
  tempCache.set(slug, { tempF, expiresAt: now + CACHE_TTL_MS })
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

// ---------------------------------------------------------------------------
// Request core (pure-ish: fetch + clock injectable for tests)
// ---------------------------------------------------------------------------

/**
 * Handle one weather request.
 * @returns {Promise<{temps: Record<string, number>, stale: boolean}>}
 *   stale=true only when towns were in scope and NOT ONE temp could be served
 *   (fresh or cached) — an honest "the feed is down" signal, never a lie.
 */
export async function handleWeather(query, opts = {}) {
  const { fetchImpl = fetch, now = Date.now, concurrency = MAX_UPSTREAM_CONCURRENCY } = opts
  const { west, south, east, north, zoom } = query
  if (zoom < MIN_ZOOM) return { temps: {}, stale: false }

  const inBox = townsInBbox(loadTowns(), west, south, east, north)
  const served = inBox.slice(0, MAX_TOWNS_PER_REQUEST) // data order = pop desc, deterministic

  const misses = []
  const temps = {}
  for (const t of served) {
    const slug = townId(t.name, t.lat, t.lon)
    const cached = cacheGet(slug, now)
    if (cached !== undefined) temps[slug] = cached
    else misses.push({ slug, town: t })
  }

  const jobs = misses.map(({ slug, town }) => async () => {
    const tempF = await fetchTownTemp(town, fetchImpl, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))
    if (tempF !== undefined) {
      cacheSet(slug, tempF, now)
      temps[slug] = tempF
    }
    return tempF !== undefined
  })
  const okFlags = await mapWithConcurrency(jobs, concurrency)

  const servedCount = Object.keys(temps).length
  const stale = served.length > 0 && servedCount === 0
  return { temps, stale }
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
