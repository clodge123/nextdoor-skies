// L5 MAP-SHELL-GAZETTEER — MapLibre GL shell + zoom-graded town gazetteer.
// Laws honored here:
//  #1 production basemap only (OpenFreeMap bright, keyless; NEVER demotiles)
//  #2 fetch-per-window (see lib/map/fetch-window.ts; basemap tiles are cached by maplibre)
//  #4 tile errors = warnings (counted in state, UI never flips to stuck error)
//  #7 coordinate-key debounce ~0.005 deg (panning within a cell emits nothing)
//  R17 determinism: no Math.random / Date.now / new Date in this file.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import townsData from '../../data/towns/us-towns.json';
import type { TownsFile } from '../lib/map/gazetteer';
import { MapProvider } from '../lib/map/map-context';
import { subscribeFlyTo } from '../lib/map/fly-to';
import { coordKey, tierForZoom, TIER_RULES, type Tier } from '../lib/map/tiers';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const TOWNS: TownsFile = townsData as TownsFile;

/** Symbol-layer paint/text spec per tier. minzoom gates label visibility. */
function tierLayers(tier: Tier): { id: string; minzoom: number; maxzoom: number; size: [number, number] } {
  const rule = TIER_RULES.find((r) => r.tier === tier)!;
  return {
    id: `nds-labels-${tier}`,
    minzoom: rule.minzoom,
    maxzoom: rule.maxzoom,
    size: tier === 'town' ? [12, 16] : tier === 'city' ? [13, 17] : tier === 'state' ? [12, 15] : [11, 13],
  };
}

export interface MapViewProps {
  /** initial view — defaults to continental US */
  center?: [number, number];
  zoom?: number;
  children?: ReactNode;
}

export default function MapView({ center = [-98.5, 39.8], zoom = 3, children }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastKeyRef = useRef<string>('');
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tileWarnings, setTileWarnings] = useState(0);
  const [tier, setTier] = useState<Tier>('country');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center,
      zoom,
      maxZoom: 18,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // W5 snapshot seam (S7): canvas capture from window.ndsMap
    });
    mapRef.current = m;
    setMap(m);
    // Debug/e2e seam (documented): lets tests + L6 inspect layers via
    // window.ndsMap.queryRenderedFeatures(...).
    (window as { ndsMap?: maplibregl.Map }).ndsMap = m;

    // Law #4: tile errors are WARNINGS — count them, never flip the UI.
    let warnCount = 0;
    m.on('error', (e) => {
      const src = (e as { sourceType?: string }).sourceType;
      if (src === 'tile' || src === 'source') {
        warnCount += 1;
        m.getContainer().dataset.ndsTileWarnings = String(warnCount);
        setTileWarnings(warnCount);
      }
    });

    m.on('load', () => {
      // Gazetteer source: baked GeoNames towns, one feature per town.
      m.addSource('nds-towns', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: TOWNS.towns.map((t) => ({
            type: 'Feature',
            properties: { name: t.name, pop: t.pop, tier: t.tier },
            geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
          })),
        },
      });
      for (const t of ['country', 'state', 'city', 'town'] as Tier[]) {
        const { id, minzoom, maxzoom, size } = tierLayers(t);
        m.addLayer({
          id,
          type: 'symbol',
          source: 'nds-towns',
          minzoom,
          maxzoom,
          filter: ['==', ['get', 'tier'], t],
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], minzoom, size[0], minzoom + 4, size[1]],
            'text-allow-overlap': false,
            'text-max-width': 8,
            'icon-allow-overlap': false,
          },
          paint: { 'text-color': '#101014', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });
      }
      setReady(true);
    });

    // Law #7: coordinate-key debounce — only emit when the 0.005deg cell changes.
    m.on('moveend', () => {
      const c = m.getCenter();
      const key = coordKey(c.lat, c.lng);
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        m.getContainer().dataset.ndsCoordKey = key;
      }
    });
    m.on('zoomend', () => setTier(tierForZoom(m.getZoom())));

    // W3-C2 FLY-TO SEAM (documented): alert-center rows (and W3-B4 search)
    // call requestFlyTo; the mounted map answers with maplibre flyTo, ~1.8s
    // (wave-1 fly-to animation law: 1.5-2s, nothing snaps). Zoom clamps UP
    // to badge-visible level (>= TOWN_BADGE_MIN_ZOOM) so badge dots land in
    // view; an explicit lower target is honored only when already visible.
    // A request arriving BEFORE style-load (deep link /?panel=... opening on
    // mount) is deferred to 'load' — maplibre drops flyTo on an unloaded
    // style, and the animation law says the jump must never teleport.
    const unsubscribeFly = subscribeFlyTo((req) => {
      const target = Math.max(9, req.zoom ?? m.getZoom());
      const run = () => m.flyTo({ center: [req.lon, req.lat], zoom: target, duration: 1800 });
      if (m.isStyleLoaded?.() !== false) run();
      else m.once('load', run);
    });

    return () => {
      unsubscribeFly();
      m.remove();
      mapRef.current = null;
    };
    // center/zoom are static initial-view props; mount-once by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MapProvider map={map} ready={ready} tileWarnings={tileWarnings} tier={tier}>
      <div
        ref={containerRef}
        data-testid="map-view"
        data-map-style="openfreemap-bright"
        data-tile-warnings={tileWarnings}
        style={{ position: 'absolute', inset: 0, background: '#f5f5f2' }}
      />
      {/* Zoom controls render OUTSIDE the canvas overlay (siblings after the
          container) with z-index above the canvas, so clicks land. Square
          geometry (R20): border-radius is var(--radius) = 0px. */}
      <div className="map-controls">
        <button
          type="button"
          aria-label="zoom in"
          onClick={() => {
            const m = mapRef.current;
            if (!m) return;
            const z = Math.min(18, m.getZoom() + 3);
            m.setZoom(z);
          }}
        >
          zoom in
        </button>
        <button
          type="button"
          aria-label="zoom out"
          onClick={() => {
            const m = mapRef.current;
            if (!m) return;
            const z = Math.max(1, m.getZoom() - 3);
            m.setZoom(z);
          }}
        >
          zoom out
        </button>
      </div>
      {children}
    </MapProvider>
  );
}
