// W3-C2 ALERT CENTER — fly-to seam (documented). No fly-to seam existed on
// main (B4 owns the search box), so this module is the app-wide channel:
// any surface (alert-center rows now, search later) asks the mounted map to
// fly. MapView subscribes on mount and drives maplibre's flyTo with the
// wave-1 fly-to animation law (~1.5-2s, nothing snaps). Pure channel: no
// clock, no randomness (R17); timing lives inside maplibre.

export interface FlyRequest {
  lon: number
  lat: number
  /** Target zoom; MapView clamps UP to badge-visible level, never down. */
  zoom?: number
}

type FlyListener = (req: FlyRequest) => void

const listeners = new Set<FlyListener>()

/** Subscribe the live map to fly requests. Returns the unsubscribe fn. */
export function subscribeFlyTo(fn: FlyListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Ask the mounted map to fly to a coordinate. No-op when no map is mounted
 *  (e.g. the /alerts page without a map — the row is then inert by design). */
export function requestFlyTo(req: FlyRequest): void {
  for (const fn of listeners) fn(req)
}
