// W5-FEED snapshot capture (docs/WAVE-2-CONTRACTS.md §S7).
// Canvas capture from the live map (window.ndsMap canvas — requires
// preserveDrawingBuffer), downscaled to ~600px JPEG data URL <=120 KB.
// No Blob, no upload. R17: pure functions, clock/RNG-free.

/** Longest-edge target for the downscaled snapshot (~600px per S7). */
export const SNAPSHOT_MAX_EDGE = 600
/** Hard cap per S7: data URL must stay <= 120 KB (122880 bytes). */
export const SNAPSHOT_MAX_BYTES = 120 * 1024
const QUALITY_LADDER = [0.8, 0.6, 0.45, 0.3]

export interface SnapshotResult {
  ok: boolean
  /** data:image/jpeg;base64,... when ok */
  dataUrl?: string
  bytes?: number
  error?: string
}

/**
 * Downscale `source` (canvas / image element) to <= SNAPSHOT_MAX_EDGE on the
 * longest side and encode JPEG. Walks a fixed quality ladder until the data
 * URL fits SNAPSHOT_MAX_BYTES. Deterministic: no randomness, no clock.
 */
export function encodeSnapshot(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): SnapshotResult {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { ok: false, error: 'empty source canvas' }
  }
  const scale = Math.min(1, SNAPSHOT_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const w = Math.max(1, Math.round(sourceWidth * scale))
  const h = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ok: false, error: 'canvas 2d context unavailable' }
  ctx.drawImage(source, 0, 0, w, h)

  for (const quality of QUALITY_LADDER) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const bytes = Math.floor((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75)
    if (bytes <= SNAPSHOT_MAX_BYTES) {
      return { ok: true, dataUrl, bytes }
    }
  }
  return { ok: false, error: `snapshot exceeds ${SNAPSHOT_MAX_BYTES} byte cap after quality ladder` }
}

/** The live map canvas (MapView publishes window.ndsMap), if mounted. */
function mapCanvas(): HTMLCanvasElement | null {
  const nds = (window as { ndsMap?: { getCanvas?(): HTMLCanvasElement } }).ndsMap
  const canvas = nds?.getCanvas?.()
  return canvas && typeof canvas.width === 'number' ? canvas : null
}

/** Capture the current map view as a post snapshot (S7). */
export function captureMapSnapshot(): SnapshotResult {
  const canvas = mapCanvas()
  if (!canvas) return { ok: false, error: 'map canvas not available' }
  return encodeSnapshot(canvas, canvas.width, canvas.height)
}

/**
 * Compose payload for POST /api/posts: attach a map snapshot when the map
 * canvas is live; degrade honestly (text-only post) when it is not.
 */
export function composePost(town: string, text: string): { town: string; text: string; snapshot?: string } {
  const payload: { town: string; text: string; snapshot?: string } = { town, text }
  const snap = captureMapSnapshot()
  if (snap.ok && snap.dataUrl) payload.snapshot = snap.dataUrl
  return payload
}
