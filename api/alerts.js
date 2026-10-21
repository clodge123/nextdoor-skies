// S6 ALERTS-PROXY — GET /api/alerts?bbox=lng1,lat1,lng2,lat2
// -> { alerts: [{ id, event, town, severity, expires }], stale?: boolean }
//
// Why server-side: NWS api.weather.gov REQUIRES a User-Agent header (browsers
// forbid setting one on fetch; the brief law "NWS REQUIRES a User-Agent").
// Flow: towns in bbox (data/towns/us-towns.json, gazetteer semantics) ->
// per-town NWS points lookup -> county zone (TXC453-style) cached PER TOWN
// (one upstream call per town, ever) -> active alerts per unique zone,
// cached 5 min. Upstream failure => empty alerts + stale:true (honest state).
//
// Determinism note (R17): server-side caches legitimately use Date.now for
// TTL bookkeeping only — no randomness, no clock in response shaping.
// Client-side modules must NOT use Date.now (see src/lib/weather/alerts.ts).

import townsData from '../data/towns/us-towns.json' with { type: 'json' }

/** NWS requires a UA with contact info per their developer guidance. */
export const NWS_USER_AGENT =
  process.env.NWS_USER_AGENT ||
  'nextdoor-skies-run2/0.1 (lane W2 alerts proxy; clodge123@users.noreply.github.com)'

export const ALERTS_CACHE_TTL_MS = 5 * 60_000

/** Viewport-bound cap: heaviest 50 towns per request (S5 precedent). */
export const MAX_TOWNS_PER_REQUEST = 50

/** townKey ("slug-lat-lon") -> county zone string | null (null = known miss). */
const fipsCache = new Map()

/** zone ("TXC453") -> { alerts: [...], fetchedAt: Date.now (server TTL) } */
const zoneCache = new Map()

/** Test seam: drop all caches so unit tests see a cold server. */
export function resetAlertCaches() {
  fipsCache.clear()
  zoneCache.clear()
}

/** Same id scheme as MapPage.townId (client badge keys) — keep in sync. */
function townId(name, lat, lon) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`
}

/** "lng1,lat1,lng2,lat2" -> normalized { west, south, east, north } | null. */
export function parseBbox(raw) {
  const parts = String(raw ?? '')
    .split(',')
    .map((s) => Number(s))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [a, b, c, d] = parts
  return {
    west: Math.min(a, c),
    east: Math.max(a, c),
    south: Math.min(b, d),
    north: Math.max(b, d),
  }
}

/** Gazetteer semantics (src/lib/map/gazetteer townsInBbox, inlined for the
 *  serverless bundle): inclusive lon/lat window over baked towns. */
export function townsInBbox(towns, west, south, east, north) {
  return towns.filter(
    (t) => t.lon >= west && t.lon <= east && t.lat >= south && t.lat <= north,
  )
}

/** "https://api.weather.gov/zones/county/TXC453" -> "TXC453" | null.
 *  Zone id shape: 2-letter state + literal C + 3-digit county FIPS. */
export function zoneFromPoints(payload) {
  const url = payload?.properties?.county
  if (typeof url !== 'string') return null
  const m = url.match(/\/county\/([A-Z]{2}C\d{3})$/)
  return m ? m[1] : null
}

async function nwsJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': NWS_USER_AGENT,
      Accept: 'application/geo+json',
    },
  })
  if (!res.ok) throw new Error(`NWS upstream HTTP ${res.status} for ${url}`)
  return res.json()
}

/** County zone for one town, cached forever (one points call per town, ever). */
export async function countyZoneFor(town, fetchImpl) {
  const key = townId(town.name, town.lat, town.lon)
  if (fipsCache.has(key)) return fipsCache.get(key)
  let zone = null
  try {
    const payload = await nwsJson(
      `https://api.weather.gov/points/${town.lat},${town.lon}`,
      fetchImpl,
    )
    zone = zoneFromPoints(payload)
  } catch {
    zone = null // known miss: never re-pull upstream for the same town
  }
  fipsCache.set(key, zone)
  return zone
}

/** Active alerts for a county zone, cached ALERTS_CACHE_TTL_MS. */
export async function alertsForZone(zone, fetchImpl, now) {
  const hit = zoneCache.get(zone)
  if (hit && now - hit.fetchedAt < ALERTS_CACHE_TTL_MS) {
    return { alerts: hit.alerts, fresh: true }
  }
  const payload = await nwsJson(
    `https://api.weather.gov/alerts/active?zone=${zone}`,
    fetchImpl,
  )
  const features = Array.isArray(payload?.features) ? payload.features : []
  // Attribution: the query is already scoped to `zone`, so every returned
  // Actual alert affects this county. (affectedZones carries FORECAST zones,
  // not county zones — filtering on them would drop valid alerts; proven
  // live 2026-10-21.)
  const alerts = features
    .filter((f) => f?.properties?.status === 'Actual')
    .map((f) => ({
      id: f.properties.id,
      event: f.properties.event,
      severity: f.properties.severity ?? 'Unknown',
      expires: f.properties.expires ?? f.properties.ends ?? null,
    }))
  zoneCache.set(zone, { alerts, fetchedAt: now })
  return { alerts, fresh: true }
}

/**
 * Core resolver: bbox -> towns -> zones -> alerts, one entry per
 * (town, alert) pair so badge dots can key by town slug. Any upstream
 * failure (points or alerts) degrades honestly: keep what we have, set
 * stale:true.
 */
export async function collectAlerts(bbox, fetchImpl, now = Date.now()) {
  const towns = townsInBbox(townsData.towns, bbox.west, bbox.south, bbox.east, bbox.north)
    .sort((a, b) => b.pop - a.pop)
    .slice(0, MAX_TOWNS_PER_REQUEST)
  if (towns.length === 0) return { alerts: [], stale: false }

  let stale = false
  const townZones = []
  for (const town of towns) {
    const zone = await countyZoneFor(town, fetchImpl)
    if (zone === null) stale = true
    townZones.push({ town, zone })
  }

  const zones = [...new Set(townZones.map((tz) => tz.zone).filter(Boolean))]
  const zoneAlerts = new Map()
  for (const zone of zones) {
    try {
      const { alerts } = await alertsForZone(zone, fetchImpl, now)
      zoneAlerts.set(zone, alerts)
    } catch {
      stale = true // upstream blip: serve the rest, flag it
    }
  }

  const out = []
  const seen = new Set()
  for (const { town, zone } of townZones) {
    if (!zone) continue
    const key = townId(town.name, town.lat, town.lon)
    for (const alert of zoneAlerts.get(zone) ?? []) {
      const dedupe = `${key}|${alert.id}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({
        id: alert.id,
        event: alert.event,
        town: key,
        severity: alert.severity,
        expires: alert.expires,
      })
    }
  }
  return { alerts: out, stale }
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' })
  }
  const bbox = parseBbox(req?.query?.bbox)
  if (!bbox) return res.status(400).json({ error: 'bbox=lng1,lat1,lng2,lat2 required' })
  try {
    const { alerts, stale } = await collectAlerts(bbox, globalThis.fetch)
    return res.status(200).json(stale ? { alerts, stale: true } : { alerts })
  } catch {
    return res.status(200).json({ alerts: [], stale: true })
  }
}
