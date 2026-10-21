// MAP CONTEXT — merged seam (L5 owner + L6 consumer).
// Two contexts, one provider:
//  - MapStateContext: rich app state (map instance, ready, tileWarnings, tier) — L5.
//  - MapContext: structural MapLike contract consumed by TownBadges (L6 seam).
// maplibregl.Map satisfies MapLike (project/getZoom/getBounds/on), so the
// provider hands the live map to both.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Tier } from './tiers';

/* ---------------- L5: app state ---------------- */

export interface MapContextValue {
  /** live maplibre instance (null until mounted) */
  map: maplibregl.Map | null;
  /** true once the style is loaded and layers are added */
  ready: boolean;
  /** count of tile errors seen — warnings only, never flips the UI (law #4) */
  tileWarnings: number;
  /** current zoom tier band */
  tier: Tier;
}

const MapStateContext = createContext<MapContextValue>({
  map: null,
  ready: false,
  tileWarnings: 0,
  tier: 'country',
});

/* ---------------- L6: structural map seam ---------------- */

export interface ProjectedPoint {
  x: number;
  y: number;
}

/** Geographic bounds in degrees. */
export interface GeoBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Minimal structural map contract the badges need. MapLibre's Map satisfies it. */
export interface MapLike {
  /** lng/lat -> screen pixel position relative to the map container. */
  project(lnglat: [number, number]): ProjectedPoint;
  getZoom(): number;
  getBounds(): GeoBounds;
  /** Subscribe to map events; returns the unsubscribe fn (MapLibre shape). */
  on?(event: string, handler: () => void): () => void;
}

export const MapContext = createContext<MapLike | null>(null);
MapContext.displayName = 'MapContext';

/* ---------------- Provider (both contexts) ---------------- */

export function MapProvider({
  map,
  ready,
  tileWarnings,
  tier,
  children,
}: MapContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ map, ready, tileWarnings, tier }),
    [map, ready, tileWarnings, tier],
  );
  return (
    <MapStateContext.Provider value={value}>
      <MapContext.Provider value={map as MapLike | null}>{children}</MapContext.Provider>
    </MapStateContext.Provider>
  );
}

/** Rich app-state hook (layers, warnings, tier). */
export function useMapContext(): MapContextValue {
  return useContext(MapStateContext);
}

/** Throws with a clear seam message when no map instance is provided. */
export function useMap(): MapLike {
  const map = useContext(MapContext);
  if (!map) {
    throw new Error('useMap(): no map instance in context. Provide MapContext (L5 map-context seam).');
  }
  return map;
}

export { MapStateContext };
