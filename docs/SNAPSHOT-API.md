# SNAPSHOT-API — W4-D1 contract (wave 4, sessions 3+7 DECIDED)

Serverless map-snapshot compositor. No browser, no canvas, no cross-origin
capture, NO FALLBACK: a snapshot request gets a real map JPEG (201) or a
loud JSON error — never a black image, never a text stand-in.

## POST /api/snapshot (session-gated)

Request (JSON body, `x-nds-session` header required):

```json
{ "lat": 37.22, "lon": -93.3, "zoom": 11 }
```

- `lat` ∈ [-90, 90], `lon` ∈ [-180, 180], `zoom` ∈ [1, 12].
- The requested zoom is the poster's view; the center is EXACT. Raster zoom
  is clamped to [1, 6] (see Deviations) — high zoom = more detail per tile,
  not more tiles.

Response 201:

```json
{ "id": "snap_k3m9d2", "url": "/api/snapshots?path=snap_k3m9d2",
  "lat": 37.22, "lon": -93.3, "zoom": 6, "bytes": 43223 }
```

Errors (loud, no fallback):

| code | when | body |
|------|------|------|
| 400 | bad lat/lon/zoom, invalid JSON | `{ "error": "..." }` |
| 401 | missing/malformed session, unknown town | `{ "error": "..." }` |
| 502 | tile fetch failed, or variance gate failed twice | `{ "error": "snapshot failed — post without image, or retry", "detail": "attempt N: ..." }` |

**Composer law (S7#4):** on 502 the composer shows
`"snapshot failed — post without image, or retry"` and offers RETRY or
POST-WITHOUT-IMAGE. It must never silently ship a snapshot-referencing post
whose image 404s, and never ship a black box.

## GET /api/snapshots/<id>  (and harness form `/api/snapshots?path=<id>`)

- 200 → stored JPEG, `content-type: image/jpeg`,
  `cache-control: public, max-age=31536000, immutable`.
- 404 `{ "error": "snapshot not found" }` for unknown ids; 400 for malformed.
- No session required (public feed images).
- Production routing (C6 law): Vercel dispatches exact files, so the client
  MUST use the query-param form `/api/snapshots?path=<id>`. The
  `api/snapshots/[id].js` path-param file exists for direct Vercel access;
  both serve the identical bytes.

## POST /api/posts — snapshot wiring (W4-D2 consumer)

Body gains optional fields:

```json
{ "town": "springfield-37.22--93.3", "text": "...",
  "snapshotId": "snap_k3m9d2", "lat": 37.22, "lon": -93.3, "zoom": 6 }
```

- `snapshotId` must exist in `snapshots` — unknown id = **400 loud**
  (`"unknown snapshotId"`), never a silent drop.
- The post row stores `snapshot_id`, `lat`, `lon`, `zoom`; the feed view
  exposes `snapshot: "/api/snapshots?path=<id>"` (render as `<img src>`).
- Legacy inline data-URL `snapshot` (wave-2 seeder path) is unchanged.

## Method (locked, S3+S7)

1. 3×3 raster tile grid from `tiles.openfreemap.org`
   (`natural_earth/ne2sr/{z}/{x}/{y}.png` — the `ne2_shaded` source of the
   app's `bright` style; same basemap MapPage paints).
2. Stitch (tiles are 512px retina), center-crop to 16:9, bilinear-resample
   to the fixed normalized canvas **640×360** (S7#2).
3. Variance gate ≥ 16 (C7 law) on luminance variance of the canvas.
   Uniform/black canvas ≈ 0. One full grid refetch allowed on fail, then 502.
4. JPEG encode (quality 72) → store in `snapshots` table (bytea).
   Determinism (R17): id = FNV-1a over normalized coords + JPEG bytes;
   created_at is the DB clock. Same input → byte-identical JPEG + id.
5. Attribution (OpenFreeMap ToS): OpenFreeMap · © OpenMapTiles ·
   Data from OpenStreetMap.

## Deviations (documented, honest)

- **Zoom clamp [1, 6]:** the ne2sr raster pyramid tops out at z6 (z7+
  upstream 404s). The `tiles.openfreemap.org/tiles/bright/...` raster
  endpoints return 403 to server-side fetches (nginx UA heuristics); only
  vector `.pbf` tiles are open there, and vector→raster would need a
  renderer (browser/WebGL) — banned by the method law. The center/zoom
  contract holds; z>6 renders at z6 detail. Seeded posts (wave-2/3 path)
  keep their existing canvas snapshots.
- **Weather strip:** S7#3 locks the bottom-bar burn-in (town · °F · icon)
  into the D2 lane (overlay). D1 returns the clean map JPEG; D2 burns the
  strip client-side before the feed render, per its lane scope.

## Gates

- vitest: `tests/snapshot-compositor.test.ts` (stitch math, variance gate,
  session gating, posts wiring, determinism).
- Playwright (gated, REAL_API=1, one run): `tests/snapshot.spec.ts` —
  POST → JPEG bytes variance ≥ 16 + `image/jpeg`; GET round-trip + immutable
  cache; 401 gating; snapshotId wiring + loud 400.
  `REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/snapshot.spec.ts`
