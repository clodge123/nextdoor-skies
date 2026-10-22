// L12 APP-WIRING — MapPage hosts the real map shell (L5 MapView) as the page
// body, with the L6 TownBadges overlay fed by viewport-filtered towns and the
// Open-Meteo batch refresher (5-min window, last-data-wins).
//
// W3-B2 TOWN PANEL (wave-3 session 2, decision 1): clicking a badge opens the
// in-map slide-over panel. Panel state lives in the URL as `?panel=<slug>`
// (src/lib/panel.ts documents the scheme): deep links open it, the back
// button closes it, close/Esc/click-outside replace the param. `/t/<slug>`
// stays the FULL town page (B1 routing).
//
// R17 determinism: town ids are slugify(name) + rounded lat/lon — pure,
// clock- and RNG-free (the check-determinism scanner flags those literals).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import townsData from '../../data/towns/us-towns.json';
import MapView from '../components/MapView';
import { TownBadges, TOWN_BADGE_MIN_ZOOM } from '../components/TownBadges';
import { TownPanel } from '../components/TownPanel';
import { AlertBanner, useAlerts } from '../components/AlertBanner';
import { alertDotForTown, type Alert } from '../lib/weather/alerts';
import { useMapContext } from '../lib/map/map-context';
import { townsInBbox, type TownsFile } from '../lib/map/gazetteer';
import { resolveTown } from '../lib/routing';
import { panelCloseHref, panelOpenHref, panelSlugFromSearch } from '../lib/panel';
import {
  createWeatherRefresher,
  type CurrentTemp,
  type GeoBounds,
  type TownCoord,
} from '../lib/weather/openmeteo-batch';

const TOWNS: TownsFile = townsData as TownsFile;

/** Lowercase, non-alnum -> single dash, trimmed. Deterministic. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Stable town id: slugified name + rounded coordinates (2dp). */
export function townId(name: string, lat: number, lon: number): string {
  return `${slugify(name)}-${Math.round(lat * 100) / 100}-${Math.round(lon * 100) / 100}`;
}

function boundsOf(map: { getBounds(): { getSouthWest(): { lng: number; lat: number }; getNorthEast(): { lng: number; lat: number } } }): GeoBounds {
  const sw = map.getBounds().getSouthWest();
  const ne = map.getBounds().getNorthEast();
  return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat };
}

/**
 * Badge overlay inside MapView: computes viewport towns (townsInBbox over
 * map.getBounds), keeps the weather refresher pointed at them, and hands
 * towns + temps to <TownBadges>.
 *
 * Refresher law (brief law 2): fetch per ~5-min window, NEVER per pan. The
 * refresher runs continuously; towns are only supplied once the zoom reaches
 * TOWN_BADGE_MIN_ZOOM (badges are invisible below it, so there is nothing to
 * fetch). When zoom CROSSES the threshold upward, the window is restarted so
 * the first fetch happens immediately — a zoom event is a window boundary,
 * not a pan.
 *
 * W3-B2: temps/codes/alerts are lifted to MapPage (props in, callbacks out)
 * so the town panel reads the SAME last-good data the badges show — one poll
 * drives every surface (S6 law), no second fetch per panel open.
 */
function MapBadges({
  temps,
  panelHrefFor,
  onPanelOpen,
  onTemps,
  onCodes,
  onAlerts,
}: {
  temps: Readonly<Record<string, number>>;
  panelHrefFor?: (townId: string) => string;
  onPanelOpen?: (townId: string) => void;
  onTemps: (townId: string, tempC: number) => void;
  onCodes: (townId: string, code: number) => void;
  onAlerts: (alerts: readonly Alert[]) => void;
}) {
  const { map, ready } = useMapContext();
  const [tick, setTick] = useState(0);
  const refresherRef = useRef<ReturnType<typeof createWeatherRefresher> | null>(null);
  const visibleRef = useRef<TownCoord[]>([]);
  const belowRef = useRef(true);

  // S6 ALERTS: one viewport-bounded refresher per 5-min window (fetch-per-
  // window law, same cadence as weather). The banner and the badge alert-dots
  // read the SAME last-good payload — one poll drives both surfaces.
  const alertState = useAlerts(
    () => (map ? boundsOf(map) : { west: 0, south: 0, east: 0, north: 0 }),
  );
  useEffect(() => {
    onAlerts(alertState.alerts);
  }, [alertState.alerts, onAlerts]);

  // Re-render on map motion so visible-town selection tracks the viewport.
  useEffect(() => {
    if (!map) return;
    const bump = () => setTick((t) => t + 1);
    map.on('moveend', bump);
    map.on('zoomend', bump);
    return () => {
      map.off('moveend', bump);
      map.off('zoomend', bump);
    };
  }, [map]);

  // Viewport-filtered towns (tick drives recompute; positions come from map).
  const visible = useMemo<TownCoord[]>(() => {
    void tick;
    if (!map) return [];
    const b = boundsOf(map);
    return townsInBbox(TOWNS.towns, b.west, b.south, b.east, b.north).map((t) => ({
      id: townId(t.name, t.lat, t.lon),
      name: t.name,
      lat: t.lat,
      lon: t.lon,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, tick]);
  visibleRef.current = visible;

  // Weather refresher: 5-min windows, injectable fetch, last-data-wins.
  useEffect(() => {
    if (!map || !ready) return;
    const refresher = createWeatherRefresher({
      getTowns: () =>
        map.getZoom() >= TOWN_BADGE_MIN_ZOOM ? visibleRef.current : [],
      getViewport: () => boundsOf(map),
      getZoom: () => map.getZoom(),
      fetchImpl: (input, init) => fetch(input, init),
      onTemps: (batch: CurrentTemp[]) => {
        for (const t of batch) {
          onTemps(t.townId, t.temperatureC);
          if (typeof t.weathercode === 'number') onCodes(t.townId, t.weathercode);
        }
      },
    });
    refresherRef.current = refresher;
    refresher.start();
    return () => {
      refresher.stop();
      refresherRef.current = null;
    };
  }, [map, ready, onTemps, onCodes]);

  // Crossing minZoom upward restarts the window (immediate first fetch).
  useEffect(() => {
    if (!map) return;
    const onZoom = () => {
      const z = map.getZoom();
      if (z >= TOWN_BADGE_MIN_ZOOM && belowRef.current) {
        belowRef.current = false;
        refresherRef.current?.stop();
        refresherRef.current?.start();
      } else if (z < TOWN_BADGE_MIN_ZOOM) {
        belowRef.current = true;
      }
    };
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [map]);

  if (!ready) return null;
  // Badge alert-dots (contract consumer seam): highest active severity per
  // visible town from the shared last-good alert payload.
  const alertsByTown: Record<string, string | null> = {};
  for (const t of visible) alertsByTown[t.id] = alertDotForTown(alertState.alerts, t.id);
  return (
    <>
      <TownBadges
        towns={visible}
        temps={temps}
        alerts={alertsByTown}
        panelHrefFor={panelHrefFor}
        onPanelOpen={onPanelOpen}
      />
      <AlertBanner state={alertState} />
    </>
  );
}

/**
 * Test hook: ?ndsCenter=lng,lat overrides the initial map center so specs can
 * land on a town-dense region (zoom-9 viewports are ~11 km wide; the default
 * center sits between baked towns). Production default unchanged.
 */
function centerFromLocation(): [number, number] {
  try {
    const raw = new URLSearchParams(window.location.search).get('ndsCenter')
    if (!raw) return [-98.5, 39.8]
    const [lng, lat] = raw.split(',').map(Number)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : [-98.5, 39.8]
  } catch {
    return [-98.5, 39.8]
  }
}

export default function MapPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // W3-B2: panel state = the URL (src/lib/panel.ts scheme: ?panel=<slug>).
  const panelSlug = panelSlugFromSearch(location.search);
  const panelTown = panelSlug ? resolveTown(panelSlug) : null;

  // Shared last-good data (one poll drives badges + banner + panel).
  const [temps, setTemps] = useState<Readonly<Record<string, number>>>({});
  const [codes, setCodes] = useState<Readonly<Record<string, number>>>({});
  const [alerts, setAlerts] = useState<readonly Alert[]>([]);

  const handleTemps = useCallback((id: string, c: number) => {
    setTemps((prev) => (prev[id] === c ? prev : { ...prev, [id]: c }));
  }, []);
  const handleCodes = useCallback((id: string, code: number) => {
    setCodes((prev) => (prev[id] === code ? prev : { ...prev, [id]: code }));
  }, []);
  const handleAlerts = useCallback((list: readonly Alert[]) => {
    setAlerts(list);
  }, []);

  // Badge click: in-app navigation (push — back button closes the panel).
  // A raw <a> reload would reset zoom/pan (animation law) and drop the
  // panel's temps below the zoom-9 refresher gate.
  const openPanel = (slug: string) => navigate(panelOpenHref(location.search, slug));
  const closePanel = () => navigate(panelCloseHref(location.search), { replace: true });

  // Badge ids ARE canonical gazetteer slugs (townId === session.townSlug —
  // same slugify + 2dp rule), so one key feeds routing, feed, and alerts.
  const panelAlerts = panelSlug ? alerts.filter((a) => a.town === panelSlug) : [];

  return (
    <section aria-labelledby="map-heading" className="map-page">
      <h1 id="map-heading">Map</h1>
      <MapView center={centerFromLocation()} zoom={3}>
        <MapBadges
          temps={temps}
          panelHrefFor={(id) => panelOpenHref(location.search, id)}
          onPanelOpen={openPanel}
          onTemps={handleTemps}
          onCodes={handleCodes}
          onAlerts={handleAlerts}
        />
      </MapView>
      {panelTown ? (
        <TownPanel
          slug={panelSlug as string}
          name={panelTown.name}
          onClose={closePanel}
          tempC={temps[panelSlug as string]}
          weathercode={codes[panelSlug as string]}
          alerts={panelAlerts}
        />
      ) : null}
    </section>
  );
}
