// W3-A3 MAP TINT — weather-driven sky-tone wash overlaying the MAP (wave-3
// brainstorm session 1, decision 6). Subtle wash over the map canvas, NOT
// the UI chrome: rendered inside .map-page (position:relative) with
// position:absolute inset:0, pointer-events:none, opacity <= 0.12, and
// ~600ms transitions. No z-index above .map-controls (z-index:2), so map
// controls stay clickable; pointer-events:none keeps every map interaction
// (pan/zoom/click) untouched.
//
// Source of truth: dominant condition across the towns currently VISIBLE,
// computed by lib/weather/map-tint from the weather refresher's last-data-
// wins temps stream (temperature-band fallback; A2 condition-code seam
// lives in that module). Below TINT_MIN_ZOOM (9) there is nothing to
// summarize, so no tint renders.
//
// R17 determinism: no Math.random / Date.now / new Date in this file.
import { useEffect, useState } from 'react';
import { useMap } from '../lib/map/map-context';
import {
  dominantCondition,
  TINT_MIN_ZOOM,
  TINT_OPACITY,
  tintClassFor,
} from '../lib/weather/map-tint';
import type { TownCoord } from '../lib/weather/openmeteo-batch';

export interface MapTintProps {
  /** Towns currently visible in the viewport (ids gate participation). */
  towns: readonly TownCoord[];
  /** townId -> Celsius, last-data-wins from the weather refresher. */
  temps: Readonly<Record<string, number>>;
  minZoom?: number;
}

export function MapTint({ towns, temps, minZoom = TINT_MIN_ZOOM }: MapTintProps) {
  const map = useMap();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = ['move', 'moveend', 'zoom', 'zoomend', 'resize']
      .map((ev) => map.on?.(ev, bump))
      .filter((f): f is () => void => typeof f === 'function');
    return () => unsubs.forEach((off) => off());
  }, [map]);

  // `tick` intentionally drives re-render only; the condition recomputes
  // purely from map state + the last-data-wins temps.
  void tick;

  const zoom = map.getZoom();
  if (zoom < minZoom) return null;

  const condition = dominantCondition(
    temps,
    towns.map((t) => t.id),
  );
  const className = tintClassFor(condition);
  if (condition === null) return null;

  return (
    <div
      data-testid="map-tint"
      data-condition={condition}
      aria-hidden="true"
      className={className}
      style={{ opacity: TINT_OPACITY }}
    />
  );
}
