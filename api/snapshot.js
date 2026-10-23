// W4 SNAPSHOT-COMPOSITOR (wave 4, lane D1) — POST /api/snapshot (session-gated)
// body {lat, lon, zoom} -> 201 {id, url} | 400 | 401 | 502.
//
// Method (docs/WAVE-4-BRAINSTORM.md sessions 3+7 DECIDED): server-side fetch
// of the 3x3 raster tile grid from tiles.openfreemap.org, stitch, crop to a
// fixed 16:9 normalized canvas, encode JPEG, variance gate (>=16), store the
// JPEG in the DB. NO browser, NO canvas, NO cross-origin capture, NO
// fallback: a snapshot request gets a real map JPEG (201) or a loud 502 JSON
// error — never a black image, never a text stand-in.
//
// Tile source: https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png
// — the `ne2_shaded` raster source of the app's `bright` style (the same
// tiles.openfreemap.org basemap layer MapPage paints). Its pyramid tops out
// at zoom 6; requested zoom is clamped [1,6] (center is EXACT, zoom is
// capped — documented deviation in docs/SNAPSHOT-API.md). Attribution per
// OpenFreeMap ToS: OpenFreeMap / OpenMapTiles / OpenStreetMap.
//
// Determinism (R17): no Math.random / Date.now / new Date anywhere in this
// file. Ids are content-hashed (FNV-1a of normalized coords + JPEG bytes);
// created_at is the DB clock (server edge, same law as api/posts.js). The
// whole pipeline is pure given the tile bytes: same coords + same tiles ->
// byte-identical JPEG + identical id.
//
// Variance gate (C7 law, mirrors scripts/seed-wave2.mjs FRESH_MIN_VARIANCE):
// luminance variance of the composited canvas must be >= 16 before storing.
// A uniform (black) canvas measures ~0. One full tile-grid refetch is allowed
// on failure (transient blank tile), then the POST fails loudly (502).
//
// Tests inject `fetchTiles` (network stub) + `db` + `gazetteer`; production
// uses the real fetch + createPgDb.

import { PNG } from 'pngjs';
import { encode as jpegEncode } from 'jpeg-js';
import { parseSession, loadGazetteer, createPgDb, hashId } from './posts.js';

// ---------------------------------------------------------------------------
// Constants (fixed — determinism law)
// ---------------------------------------------------------------------------

export const TILE_PX = 256; // nominal web-map tile edge (ne2sr serves 2x: 512)
export const GRID_TILES = 3; // 3x3 grid (S3 law)
export const OUT_W = 640; // fixed normalized canvas (S7#2: 16:9)
export const OUT_H = 360;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6; // ne2sr raster pyramid ceiling (z7+ 404s upstream)
export const VARIANCE_MIN = 16; // C7 freshness bar (seed-wave2.mjs precedent)
export const JPEG_QUALITY = 72;
export const TILE_TIMEOUT_MS = 8000;
export const TILE_URL_TEMPLATE =
  'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png';
export const TILE_USER_AGENT = 'nextdoor-skies-compositor/1.0 (+https://nextdoor-skies.app)';
export const SNAP_ID_RE = /^snap_[0-9a-z]+$/;

// ---------------------------------------------------------------------------
// Pure geometry (exported for tests)
// ---------------------------------------------------------------------------

/** Web-Mercator tile coords (fractional) for a lon/lat at zoom. */
export function worldTile(lon, lat, zoom) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

/** The 3x3 tile grid centered on the lon/lat view center. Deterministic:
 *  center tile = round(world coords); x wraps at the antimeridian; y clamps
 *  at the poles (edge clamp, standard slippy-map law). */
export function tileGrid(lon, lat, zoom) {
  const c = worldTile(lon, lat, zoom);
  const n = Math.pow(2, zoom);
  const cx = Math.round(c.x);
  const cy = Math.round(c.y);
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      cells.push({
        z: zoom,
        x: ((cx + dx) % n + n) % n,
        y: Math.min(n - 1, Math.max(0, cy + dy)),
        col: dx + 1,
        row: dy + 1,
      });
    }
  }
  return cells;
}

/** Stitch the 3x3 RGBA tiles into one grid canvas (row/col place). Tile
 *  edge is taken from the tiles themselves (ne2sr serves 512px retina
 *  tiles); gridPx = 3 * edge. */
export function stitchTiles(tiles) {
  const edge = tiles[0]?.data ? tiles[0].size : TILE_PX;
  const gridPx = GRID_TILES * edge;
  const buf = new Uint8ClampedArray(gridPx * gridPx * 4);
  for (const t of tiles) {
    const ox = t.col * edge;
    const oy = t.row * edge;
    for (let y = 0; y < edge; y++) {
      const s = y * edge * 4;
      const d = ((oy + y) * gridPx + ox) * 4;
      buf.set(t.data.subarray(s, s + edge * 4), d);
    }
  }
  return buf;
}

function sampleBilinear(rgba, w, sx, sy) {
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(w - 1, y0 + 1);
  const fx = sx - x0, fy = sy - y0;
  const o = (y, x) => (y * w + x) * 4;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const tl = rgba[o(y0, x0) + c], tr = rgba[o(y0, x1) + c];
    const bl = rgba[o(y1, x0) + c], br = rgba[o(y1, x1) + c];
    out[c] = Math.round(tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) + bl * (1 - fx) * fy + br * fx * fy);
  }
  return out;
}

/** Center-crop the grid canvas to 16:9 and bilinear-resample to OUT_W x OUT_H.
 *  Pure, fixed math (no RNG/clock). */
export function cropTo16x9(rgba, gridPx = GRID_TILES * TILE_PX) {
  const cropW = gridPx;
  const cropH = Math.round((gridPx * OUT_H) / OUT_W); // 432 @ 768 grid
  const cropY = Math.floor((gridPx - cropH) / 2);
  const out = new Uint8ClampedArray(OUT_W * OUT_H * 4);
  for (let oy = 0; oy < OUT_H; oy++) {
    const sy = Math.min(gridPx - 1, Math.max(0, cropY + (oy + 0.5) * (cropH / OUT_H) - 0.5));
    for (let ox = 0; ox < OUT_W; ox++) {
      const sx = Math.min(gridPx - 1, Math.max(0, (ox + 0.5) * (cropW / OUT_W) - 0.5));
      const [r, g, b] = sampleBilinear(rgba, gridPx, sx, sy);
      const o = (oy * OUT_W + ox) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Full composite: stitch -> crop -> 16:9 RGBA canvas. */
export function composeSnapshot(tiles) {
  const edge = tiles[0]?.data ? tiles[0].size : TILE_PX;
  return cropTo16x9(stitchTiles(tiles), GRID_TILES * edge);
}

/** Luminance variance of an RGBA canvas (C7 metric, seed-wave2.mjs formula).
 *  Uniform canvas (black/blank) measures ~0; real imagery exceeds 16 by
 *  orders of magnitude. */
export function varianceOf(rgba) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    sum += lum;
    sum2 += lum * lum;
    n++;
  }
  if (!n) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Encode RGBA canvas -> JPEG Buffer (fixed quality, deterministic).
 *  NOTE: jpeg-js encode(imgData, qu) takes a NUMERIC quality (0-100); the
 *  object form silently NaN-quantizes to a constant image. */
export function encodeJpeg(rgba, w = OUT_W, h = OUT_H) {
  const out = jpegEncode(
    { data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: w, height: h },
    JPEG_QUALITY,
  );
  return Buffer.from(out.data);
}

/** FNV-1a over bytes -> base36 (content hash for ids; no RNG). */
export function fnvHex(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Validate/normalize the POST body. Returns {lat,lon,zoom} | {error}. */
export function parseSnapshotBody(json) {
  const lat = Number(json?.lat);
  const lon = Number(json?.lon);
  const zoom = Number(json?.zoom);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'lat must be a number in [-90, 90]' };
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'lon must be a number in [-180, 180]' };
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 12) return { error: 'zoom must be a number in [1, 12]' };
  return {
    lat: Math.min(85.0511, Math.max(-85.0511, lat)), // Mercator validity clamp
    lon,
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom))),
  };
}

// ---------------------------------------------------------------------------
// Tile fetch (network edge; injectable in tests)
// ---------------------------------------------------------------------------

/** Fetch the 3x3 PNG grid for (lon, lat, zoom). Throws on any non-200. */
export async function fetchTileGrid(lon, lat, zoom) {
  const cells = tileGrid(lon, lat, zoom);
  return Promise.all(
    cells.map(async (c) => {
      const url = TILE_URL_TEMPLATE.replace('{z}', String(c.z))
        .replace('{x}', String(c.x))
        .replace('{y}', String(c.y));
      const res = await fetch(url, {
        headers: { 'user-agent': TILE_USER_AGENT },
        signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`tile ${c.z}/${c.x}/${c.y} -> HTTP ${res.status}`);
      const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
      if (png.width !== png.height || png.width < 128) {
        throw new Error(`tile ${c.z}/${c.x}/${c.y} -> unexpected ${png.width}x${png.height}`);
      }
      return { ...c, data: png.data, size: png.width };
    }),
  );
}

// ---------------------------------------------------------------------------
// Handler factory (db + gazetteer + fetchTiles injected; tests stub all)
// ---------------------------------------------------------------------------

export function createHandler({ db, gazetteer, fetchTiles = fetchTileGrid }) {
  return async function handler(req, res) {
    const method = (req.method ?? 'GET').toUpperCase();

    // ---- GET /api/snapshots?path=<id> — stored JPEG, immutable cache ----
    // Production routing law (C6): Vercel dispatches ONLY the exact
    // /api/snapshots file, so the supported GET form is the query-param
    // route. Same shape as api/posts.js subpath handling.
    if (method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://local');
      const id = (url.searchParams.get('path') ?? '').trim();
      if (!id) return res.status(400).json({ error: 'path param required' });
      if (!SNAP_ID_RE.test(id)) return res.status(400).json({ error: 'invalid snapshot id' });
      const row = await db.getSnapshot(id);
      if (!row) return res.status(404).json({ error: 'snapshot not found' });
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      res.setHeader('content-type', 'image/jpeg');
      res.setHeader('content-length', String(row.jpeg.length));
      res.statusCode = 200;
      return res.end(row.jpeg);
    }

    if (method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    const { session, error } = parseSession(req, gazetteer);
    if (!session) return res.status(401).json({ error });

    const body = await readJson(req);
    if (body.error) return res.status(body.code ?? 400).json({ error: body.error });
    const geo = parseSnapshotBody(body.json);
    if (geo.error) return res.status(400).json({ error: geo.error });
    const { lat, lon, zoom } = geo;

    // Compose loop: first attempt + ONE full grid refetch (transient blank
    // tile law). Two failed gates = loud 502. No fallback, no black image.
    let detail = 'unreachable';
    for (let attempt = 1; attempt <= 2; attempt++) {
      let tiles;
      try {
        tiles = await fetchTiles(lon, lat, zoom);
      } catch (err) {
        detail = `attempt ${attempt}: tile fetch failed: ${String(err?.message ?? err)}`;
        continue;
      }
      const rgba = composeSnapshot(tiles);
      const variance = varianceOf(rgba);
      if (variance < VARIANCE_MIN) {
        detail = `attempt ${attempt}: variance gate failed (${variance.toFixed(1)} < ${VARIANCE_MIN}) — uniform canvas`;
        continue;
      }
      const jpeg = encodeJpeg(rgba);
      const id = hashId('snap', lat.toFixed(5), lon.toFixed(5), String(zoom), fnvHex(jpeg));
      await db.insertSnapshot({ id, jpeg, lat, lon, zoom });
      return res
        .status(201)
        .json({ id, url: `/api/snapshots?path=${encodeURIComponent(id)}`, lat, lon, zoom, bytes: jpeg.length });
    }
    return res
      .status(502)
      .json({ error: 'snapshot failed — post without image, or retry', detail });
  };
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

async function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return { json: req.body };
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (raw.length > 1_500_000) return { error: 'body too large', code: 413 };
  if (!raw.length) return { json: {} };
  try {
    return { json: JSON.parse(raw.toString('utf8')) };
  } catch {
    return { error: 'invalid JSON body', code: 400 };
  }
}

// ---------------------------------------------------------------------------
// Vercel entrypoint (process edge: env read allowed here)
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const gazetteer = await loadGazetteer();
  if (!globalThis.__ndsPool) {
    if (!process.env.POSTGRES_URL) return res.status(500).json({ error: 'POSTGRES_URL not set' });
    const { default: pg } = await import('pg');
    globalThis.__ndsPool = new pg.Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  const handle = createHandler({ db: createPgDb(globalThis.__ndsPool), gazetteer });
  return handle(req, res);
}
