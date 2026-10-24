// W4-D2 SNAPSHOT-OVERLAY — client side of the snapshot composer flow
// (docs/WAVE-4-BRAINSTORM.md S7/S8, docs/SNAPSHOT-API.md, C-03 law).
//
// Scope:
//   1. requestSnapshot() — POST /api/snapshot (session-gated) at the poster's
//      view (center + zoom). Loud ApiResult, never throws, never fabricates.
//   2. burnInStrip() — V1 bottom-bar burn-in (town · time · °F · weather
//      icon) ONCE at upload, client-side, deterministic (S7#3: D1 returns the
//      CLEAN map JPEG; D2 owns the strip). The burned JPEG is what the post
//      stores (inline data URL <=120 KB, the wave-2 storage seam), so the
//      feed renders real map pixels — NEVER black (no-fallback law).
//   3. Author + timestamp stay BELOW the image in feed chrome (C-03) — they
//      are never burned into the snapshot.
//
// Units law (W4-A1): every rendered temperature goes through formatTemp() /
// getUnit() from weather/units.ts (Fahrenheit default). The weather proxy
// answers in Fahrenheit, so we convert F -> C and let formatTemp apply the
// active display unit — the strip follows the header toggle.
//
// Determinism (R17): no Math.random / Date.now / new Date. The strip TIME
// comes from the HTTP `date` header of the POST /api/snapshot response
// (server clock, same edge precedent as api/posts.js createdAt) parsed via
// Date.parse + pure epoch math. Same inputs + same tiles -> same pixels.

import { getUnit, formatTemp, fToC } from './weather/units'
import { weathercodeToIcon } from './weather/weathercode'
import type { ApiResult, Session } from './feed'

/** Session-gated compositor endpoint (api/snapshot.js). */
export const SNAPSHOT_ENDPOINT = '/api/snapshot'

/** Poster's requested view zoom (S7: ~12). W4-BF: the server honors it now
 *  (CARTO raster z14+); the old ne2sr source clamped everything to z6 and
 *  every snapshot showed a continent, not the town (owner critique). */
export const CAPTURE_ZOOM = 11

/** Fixed normalized canvas — MUST match api/snapshot.js OUT_W/OUT_H (S7#2). */
export const CANVAS_W = 640
export const CANVAS_H = 360

/** Bottom strip height on the 640x360 canvas (S7#3 locked bar). */
export const STRIP_H = 48

/** Inline storage cap: burned JPEG data URL must fit wave-2 S7 (120 KB). */
export const BURNED_MAX_BYTES = 120 * 1024
const QUALITY_LADDER = [0.8, 0.6, 0.45, 0.3]

/* --------------------------------------------------------------------------
 * URL builders (C6 law: Vercel dispatches exact files, so the supported
 * GET form is the query-param route; the path-param twin is production-only)
 * ------------------------------------------------------------------------ */

/** GET url for a stored snapshot id (query-param form, C6 law). */
export function snapshotUrl(id: string): string {
  return `/api/snapshots?path=${encodeURIComponent(id)}`
}

/* --------------------------------------------------------------------------
 * Pure helpers
 * ------------------------------------------------------------------------ */

/**
 * Parse canonical session town slug "springfield-37.22--93.3" into coords.
 * Returns null when the slug carries no coordinate tail (the composer then
 * falls back to the gazetteer lookup, never a guessed center).
 */
export function parseTownCoords(slug: string): { lat: number; lon: number } | null {
  const m = /(^|[^0-9.])-(-?\d+\.\d+)-(-?\d+\.\d+)$/.exec(slug)
  if (!m) return null
  const lat = Number(m[2])
  const lon = Number(m[3])
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null
  return { lat, lon }
}

/**
 * Pure epoch-ms -> "YYYY-MM-DD HH:MM" (UTC, deterministic). Needed because
 * R17 bans `new Date` in src and the snapshot response carries only the
 * HTTP `date` header (server clock edge).
 */
export function formatEpochStamp(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const d = Math.floor(ms / 1000)
  const day = Math.floor(d / 86400)
  const ymd = civilFromDays(day)
  const sec = d - day * 86400
  const hh = Math.floor(sec / 3600)
  const mi = Math.floor((sec % 3600) / 60)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${ymd.y}-${p(ymd.m)}-${p(ymd.d)} ${p(hh)}:${p(mi)}`
}

/** Civil calendar from days-since-epoch (Howard Hinnant algorithm, pure). */
function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return { y, m, d }
}

/** Parse an HTTP `date` header to an epoch-ms stamp; null when absent/bad. */
export function parseDateHeader(header: string | null): number | null {
  if (!header) return null
  const ms = Date.parse(header)
  return Number.isFinite(ms) ? ms : null
}

/* --------------------------------------------------------------------------
 * Strip layout (pure geometry — vitest target)
 * ------------------------------------------------------------------------ */

export interface StripLayout {
  barY: number
  barH: number
  townX: number
  townMaxW: number
  timeRight: number
  tempRight: number
  iconBox: { x: number; y: number; size: number }
}

/**
 * V1 bottom-bar geometry on a w x h canvas (M3 layout, S7#3):
 * [town ............] [time] [°F] [icon]. All boxes sit inside the strip;
 * the icon box is a fixed 24px square at the right edge.
 */
export function stripLayout(w = CANVAS_W, h = CANVAS_H, stripH = STRIP_H): StripLayout {
  return {
    barY: h - stripH,
    barH: stripH,
    townX: 14,
    townMaxW: Math.round(w * 0.42),
    timeRight: w - 130,
    tempRight: w - 52,
    iconBox: { x: w - 40, y: h - stripH / 2 - 12, size: 24 },
  }
}

/** Data burned into the strip (all strings pre-rendered — pure draw). */
export interface StripData {
  town: string
  /** "2026-10-23 02:56" (UTC stamp) — empty string renders "—". */
  time: string
  /** formatTemp() output, e.g. "70°F" — honest "—°F" when weather is down. */
  temp: string
  /** weathercode bucket name; null = no icon (honest, R19). */
  bucket: string | null
}

/**
 * Build strip data from a weather proxy response payload for one town slug.
 * Proxy shape: { temps: {slug: °F}, codes: {slug: wmoCode} }. Missing temp
 * renders "—°F" (never a guessed number); missing code renders NO icon.
 */
export function buildStripData(
  townName: string,
  slug: string,
  payload: unknown,
  time: string,
): StripData {
  const temps = (payload as { temps?: Record<string, unknown> })?.temps
  const codes = (payload as { codes?: Record<string, unknown> })?.codes
  const f = temps && typeof temps === 'object' ? temps[slug] : undefined
  const temp = typeof f === 'number' && Number.isFinite(f) ? formatTemp(fToC(f), getUnit()) : '—°F'
  const rawCode = codes && typeof codes === 'object' ? codes[slug] : undefined
  const bucket =
    typeof rawCode === 'number' && Number.isFinite(rawCode)
      ? weathercodeToIcon(Math.trunc(rawCode)).bucket
      : null
  return { town: townName, time, temp, bucket }
}

/* --------------------------------------------------------------------------
 * Weather glyph (canvas vector — mirrors weathercode.ts buckets; lucide
 * React components do not rasterize to canvas, so the same WMO buckets get
 * hand-drawn terminal glyphs, theme-neutral neon-green strokes).
 * ------------------------------------------------------------------------ */

export const NEON = '#00ff9d'
const STRIP_BG = 'rgba(2,8,6,0.82)'

/** Draw one weather bucket glyph centered in a `size` box at (x, y). */
export function drawWeatherGlyph(
  ctx: CanvasRenderingContext2D,
  bucket: string,
  x: number,
  y: number,
  size: number,
  color = NEON,
): void {
  const s = size / 24 // unit box (24 = lucide viewBox)
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2 * s
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const cloud = () => {
    ctx.beginPath()
    ctx.arc(9 * s, 14 * s, 4 * s, Math.PI * 0.5, Math.PI * 1.5)
    ctx.arc(13 * s, 11 * s, 5 * s, Math.PI * 0.95, Math.PI * 0.2)
    ctx.arc(17.5 * s, 14.5 * s, 3.5 * s, Math.PI * 1.35, Math.PI * 0.55)
    ctx.closePath()
    ctx.stroke()
  }
  switch (bucket) {
    case 'clear':
      ctx.beginPath()
      ctx.arc(12 * s, 12 * s, 4.5 * s, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i
        ctx.beginPath()
        ctx.moveTo(12 * s + Math.cos(a) * 7 * s, 12 * s + Math.sin(a) * 7 * s)
        ctx.lineTo(12 * s + Math.cos(a) * 9.5 * s, 12 * s + Math.sin(a) * 9.5 * s)
        ctx.stroke()
      }
      break
    case 'partly-cloudy':
      ctx.beginPath()
      ctx.arc(16 * s, 8 * s, 3 * s, 0, Math.PI * 2)
      ctx.stroke()
      cloud()
      break
    case 'cloudy':
      cloud()
      break
    case 'fog':
      cloud()
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(5 * s + i * 2 * s, (18 + i) * s)
        ctx.lineTo((19 - i) * s, (18 + i) * s)
        ctx.stroke()
      }
      break
    case 'drizzle':
      cloud()
      for (let i = 0; i < 2; i++) {
        ctx.beginPath()
        ctx.moveTo((9 + i * 6) * s, 20 * s)
        ctx.lineTo((9 + i * 6) * s, 22 * s)
        ctx.stroke()
      }
      break
    case 'rain':
      cloud()
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo((8 + i * 4) * s, 19 * s)
        ctx.lineTo((7 + i * 4) * s, 22.5 * s)
        ctx.stroke()
      }
      break
    case 'freezing':
    case 'snow':
      cloud()
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo((8 + i * 4) * s, 21 * s)
        ctx.lineTo((8 + i * 4) * s, 21.5 * s)
        ctx.stroke()
      }
      break
    case 'thunder':
      cloud()
      ctx.beginPath()
      ctx.moveTo(11 * s, 18 * s)
      ctx.lineTo(9 * s, 21.5 * s)
      ctx.lineTo(12 * s, 21.5 * s)
      ctx.lineTo(10 * s, 24 * s)
      ctx.stroke()
      break
    default:
      // honest neutral: a plain "?" box (never a blank chip)
      ctx.strokeRect(8 * s, 8 * s, 8 * s, 8 * s)
      break
  }
  ctx.restore()
}

/* --------------------------------------------------------------------------
 * Burn-in (canvas overlay ONCE at upload, deterministic)
 * ------------------------------------------------------------------------ */

/**
 * Compose the V1 strip onto a clean snapshot data URL: draw the map, paint
 * the bottom bar, town/time/temp text, weather glyph, then re-encode JPEG
 * walking the quality ladder until the data URL fits BURNED_MAX_BYTES.
 * Loud failure (never a black output): empty source / dead canvas -> ok:false.
 */
export function burnInStrip(source: CanvasImageSource, strip: StripData): { dataUrl: string; bytes: number } | { error: string } {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return { error: 'canvas 2d context unavailable' }
  ctx.drawImage(source, 0, 0, CANVAS_W, CANVAS_H)
  drawStrip(ctx, strip)

  for (const quality of QUALITY_LADDER) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const bytes = Math.floor((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75)
    if (bytes <= BURNED_MAX_BYTES) return { dataUrl, bytes }
  }
  return { error: `burned snapshot exceeds ${BURNED_MAX_BYTES} byte cap after quality ladder` }
}

/** Pure strip paint (exported for tests): bar + town · time · °F · icon. */
export function drawStrip(ctx: CanvasRenderingContext2D, strip: StripData, layout = stripLayout()): void {
  ctx.save()
  ctx.fillStyle = STRIP_BG
  ctx.fillRect(0, layout.barY, CANVAS_W, layout.barH)
  ctx.strokeStyle = NEON
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, layout.barY + 1)
  ctx.lineTo(CANVAS_W, layout.barY + 1)
  ctx.stroke()

  ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textBaseline = 'middle'
  const midY = layout.barY + layout.barH / 2

  ctx.fillStyle = NEON
  ctx.textAlign = 'left'
  ctx.fillText(truncate(ctx, strip.town.toUpperCase(), layout.townMaxW), layout.townX, midY)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#d8ffef'
  ctx.fillText(strip.time ? strip.time : '—', layout.timeRight, midY)
  ctx.fillStyle = NEON
  ctx.font = 'bold 16px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(strip.temp, layout.tempRight, midY)

  // W4-BF attribution law (CARTO basemap ToS §13: static images must carry
  // legible attribution): burned once, bottom-left under the town line,
  // 9px — legible, non-intrusive. Mirrors the OSM credit the app shows in
  // the map corner.
  ctx.font = '9px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillText('© CARTO © OpenStreetMap', layout.townX, layout.barY + layout.barH - 7)

  if (strip.bucket) {
    drawWeatherGlyph(ctx, strip.bucket, layout.iconBox.x, layout.iconBox.y, layout.iconBox.size)
  }
  ctx.restore()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

/* --------------------------------------------------------------------------
 * Network seams (injectable fetch; honest ApiResult, never throws)
 * ------------------------------------------------------------------------ */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function sessionHeaders(session: Session): Record<string, string> {
  return { 'content-type': 'application/json', 'x-nds-session': JSON.stringify(session) }
}

export interface SnapshotCapture {
  id: string
  url: string
  lat: number
  lon: number
  zoom: number
  /** "YYYY-MM-DD HH:MM" UTC from the response `date` header ('' = absent). */
  stamp: string
}

/**
 * POST /api/snapshot (session-gated). 201 -> capture reference; every other
 * outcome is a loud ApiResult (502 carries the S7#4 composer message).
 */
export async function requestSnapshot(
  view: { lat: number; lon: number; zoom: number },
  session: Session,
  fetchImpl: FetchLike = (i, init) => window.fetch(i, init),
): Promise<ApiResult<SnapshotCapture>> {
  try {
    const res = await fetchImpl(SNAPSHOT_ENDPOINT, {
      method: 'POST',
      headers: sessionHeaders(session),
      body: JSON.stringify(view),
    })
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { error?: unknown }
        if (typeof body?.error === 'string' && body.error) message = body.error
      } catch {
        /* non-JSON body — keep the status line */
      }
      return { ok: false, status: res.status, error: message }
    }
    const data = (await res.json()) as Record<string, unknown>
    const id = typeof data.id === 'string' ? data.id : ''
    if (!/^snap_[0-9a-z]+$/.test(id)) return { ok: false, status: 0, error: 'malformed snapshot response' }
    const stamp = formatEpochStamp(parseDateHeader(res.headers.get('date')) ?? NaN)
    return {
      ok: true,
      data: {
        id,
        url: typeof data.url === 'string' ? data.url : snapshotUrl(id),
        lat: Number(data.lat),
        lon: Number(data.lon),
        zoom: Number(data.zoom),
        stamp,
      },
    }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' }
  }
}

/** Fetch stored snapshot JPEG bytes (GET, query-param url). */
export async function fetchSnapshotBytes(
  url: string,
  fetchImpl: FetchLike = (i, init) => window.fetch(i, init),
): Promise<ApiResult<ArrayBuffer>> {
  try {
    const res = await fetchImpl(url, { method: 'GET' })
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    return { ok: true, data: await res.arrayBuffer() }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' }
  }
}

/** Live weather for one town point via the same-origin proxy (S5 shape).
 *  Tiny bbox around the point; zoom 9 satisfies the proxy's badge gate. */
export async function fetchTownWeather(
  lat: number,
  lon: number,
  fetchImpl: FetchLike = (i, init) => window.fetch(i, init),
): Promise<unknown> {
  const url = `/api/weather?bbox=${(lon - 0.01).toFixed(4)},${(lat - 0.01).toFixed(4)},${(lon + 0.01).toFixed(4)},${(lat + 0.01).toFixed(4)}&zoom=9`
  const res = await fetchImpl(url, { method: 'GET' })
  if (!res.ok) return {}
  try {
    return await res.json()
  } catch {
    return {}
  }
}

/** Decode JPEG bytes to a drawable image (img element + data URL). */
export function decodeJpeg(bytes: ArrayBuffer): Promise<HTMLImageElement> {
  let bin = ''
  const u8 = new Uint8Array(bytes)
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  const img = new Image()
  img.decoding = 'sync'
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('snapshot decode failed'))
    img.src = `data:image/jpeg;base64,${btoa(bin)}`
  })
}

/** Full upload pipeline: capture -> decode -> burn strip -> data URL. */
export async function composeBurnedSnapshot(
  capture: SnapshotCapture,
  strip: StripData,
  fetchImpl: FetchLike,
): Promise<{ dataUrl: string; bytes: number } | { error: string }> {
  const bytes = await fetchSnapshotBytes(capture.url, fetchImpl)
  if (!bytes.ok) return { error: `snapshot fetch failed (${bytes.error})` }
  let img: HTMLImageElement
  try {
    img = await decodeJpeg(bytes.data)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'snapshot decode failed' }
  }
  return burnInStrip(img, strip)
}

/** S7#4 composer law — the exact loud message the gate must show. */
export const SNAPSHOT_FAILED_MESSAGE = 'snapshot failed — post without image, or retry'
