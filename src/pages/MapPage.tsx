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
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import townsData from '../../data/towns/us-towns.json';
import MapView from '../components/MapView';
import { TownBadges } from '../components/TownBadges';
import { TownLabelTargets, type TownTargetCoord } from '../components/TownLabelTargets';
import { MapTint } from '../components/MapTint';
import { TownPanel } from '../components/TownPanel';
import { useAlerts, type BannerState } from '../components/AlertBanner';
import AlertCenter, { PANEL_TITLE } from '../components/AlertCenter';
import SidePanel, { usePanelState } from '../components/SidePanel';
import { alertDotForTown } from '../lib/weather/alerts';
import { useMapContext } from '../lib/map/map-context';
import { townsInBbox, type TownsFile } from '../lib/map/gazetteer';
import { resolveTown } from '../lib/routing';
import { panelCloseHref, panelOpenHref, panelSlugFromSearch } from '../lib/panel';
import { requestFlyTo } from '../lib/map/fly-to';
import { prefetchTownPosts } from '../lib/feed-prefetch';
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
 * W3-B2: temps/codes flow OUT to MapPage (callbacks) so the town panel reads
 * the SAME last-good data the badges show — one poll drives every surface
 * (S6 law), no second fetch per panel open.
 */
function MapBadges({
  temps,
  codes,
  boundsRef,
  alertState,
  panelHrefFor,
  onPanelOpen,
  onAlertOpen,
  onTownFocus,
  onTemps,
  onCodes,
}: {
  temps: Readonly<Record<string, number>>;
  codes: Readonly<Record<string, number>>;
  boundsRef: MutableRefObject<GeoBounds>;
  alertState: BannerState;
  panelHrefFor?: (townId: string) => string;
  onPanelOpen?: (townId: string) => void;
  /** W3-B3: badge alert-dot click -> /alerts (deepest intent). */
  onAlertOpen?: (townId: string) => void;
  /** W4-C2: hover/focus prefetch seam (ring law -> posts, LRU-capped). */
  onTownFocus?: (townId: string) => void;
  onTemps: (townId: string, tempC: number) => void;
  onCodes: (townId: string, code: number) => void;
}) {
  const { map, ready } = useMapContext();
  const [tick, setTick] = useState(0);
  const refresherRef = useRef<ReturnType<typeof createWeatherRefresher> | null>(null);
  const visibleRef = useRef<TownCoord[]>([]);
  const belowRef = useRef(true);

  // W3-C2: the viewport used by the ONE shared alerts refresher (owned by
  // MapPage) tracks the map here — fetch-per-window law means the refresher
  // reads it at window boundaries, never per pan. Badge dots read the SAME
  // last-good payload (contract consumer seam alertDotForTown).
  useEffect(() => {
    if (!map) return;
    const sync = () => {
      boundsRef.current = boundsOf(map);
    };
    sync();
    map.on('moveend', sync);
    map.on('zoomend', sync);
    return () => {
      map.off('moveend', sync);
      map.off('zoomend', sync);
    };
  }, [map, boundsRef]);

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
      // W4-B2 ZOOM-MATCH: tier rides along so TownBadges gates each badge on
      // its own tier's label band (session-1 law #4), not a global zoom cut.
      tier: t.tier,
      // W4-BF DENSITY LAW: pop rides along for the per-frame badge cap and
      // the refresher's pop-top <=50 window (deterministic, data-sorted).
      pop: t.pop,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, tick]);
  visibleRef.current = visible;

  // Weather refresher: 5-min windows, injectable fetch, last-data-wins.
  // W3-A2: weathercodes ride the same batch (finite ints only — a town with
  // no real code is ABSENT, its badge renders no icon, R19 honest).
  useEffect(() => {
    if (!map || !ready) return;
    const refresher = createWeatherRefresher({
      // W4-BF SINGLE-GATE LAW: badges render from z1 (tier bands), so the
      // refresher feeds them at EVERY zoom — the old z9 gate left every
      // badge below z9 permanently "awaiting feed" (owner critique). The
      // refresher's own pop-top <=50 window bounds the request; the server
      // gate (MIN_ZOOM=1) matches.
      getTowns: () => visibleRef.current,
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

  // W4-BF: the old zoom-crossing restart existed because the refresher was
  // gated at z9. Single-gate law: the refresher runs continuously at every
  // zoom (badges render from z1), so no gate-crossing exists to restart on.
  void belowRef;

  if (!ready) return null;
  // Badge alert-dots (contract consumer seam): highest active severity per
  // visible town from the shared last-good alert payload.
  const alertsByTown: Record<string, string | null> = {};
  for (const t of visible) alertsByTown[t.id] = alertDotForTown(alertState.alerts, t.id);
  return (
    <>
      {/* W3-A3 MAP TINT: sky-tone wash by dominant condition over the MAP
          (below zoom 9 nothing renders — same gate as the badges). */}
      <MapTint towns={visible} temps={temps} />
      <TownBadges
        towns={visible}
        temps={temps}
        codes={codes}
        alerts={alertsByTown}
        panelHrefFor={panelHrefFor}
        onPanelOpen={onPanelOpen}
        onAlertOpen={onAlertOpen}
        onTownFocus={onTownFocus}
      />
      {/* W3-C1/C2: the alert banner overlay stays UNMOUNTED; the alert center
          renders in the side panel (fed by the SAME payload MapPage owns).
          One poll per window drives badge dots AND the alert center. */}
    </>
  );
}

/**
 * W3-B3 CLICK-TO-DETAIL: label/dot targets below the badge zoom grade.
 * Gated on the map being READY (same law as MapBadges) — MapView's children
 * render before the style loads, and useMap() needs the live instance.
 */
function MapTargets({
  towns,
  panelHrefFor,
  onPanelOpen,
  onTownFocus,
}: {
  towns: readonly TownTargetCoord[]
  panelHrefFor?: (townId: string) => string
  onPanelOpen?: (townId: string) => void
  onTownFocus?: (townId: string) => void
}) {
  const { ready } = useMapContext()
  if (!ready) return null
  return (
    <TownLabelTargets
      towns={towns}
      panelHrefFor={panelHrefFor}
      onPanelOpen={onPanelOpen}
      onTownFocus={onTownFocus}
    />
  )
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

/**
 * Initial viewport for the shared alerts refresher before the map reports
 * its bounds (continental US, same fixed bbox law as the /alerts page — the
 * server caps requests at 50 towns by population). Once MapBadges mounts,
 * window polls track the live viewport.
 */
export const ALERTS_INITIAL_BOUNDS: GeoBounds = { west: -125, south: 24, east: -66, north: 50 }

export default function MapPage() {
  // W3-C1 LAYOUT-SHELL: map docked beside the right side panel (open by
  // default on desktop, collapsed bottom sheet on mobile; `P` toggles).
  const panel = usePanelState();

  // W3-B2: panel state = the URL (src/lib/panel.ts scheme: ?panel=<slug>).
  const navigate = useNavigate();
  const location = useLocation();
  const panelSlug = panelSlugFromSearch(location.search);
  const panelTown = panelSlug ? resolveTown(panelSlug) : null;

  // W3-B4 SEARCH + FLY-TO (session 2 decision 3, animation law): opening the
  // panel FLIES the map to the town — every panel open flies, whatever the
  // surface that opened it (search select, badge tap, deep link). One seam
  // (src/lib/map/fly-to.ts), one rule: panelSlug transitions null->slug (or
  // slug->slug) fire requestFlyTo at zoom 9; closing (slug->null) never
  // flies. URL honesty: flying writes NOTHING to the URL — ?ndsCenter is
  // the e2e center hook only; `?panel=<slug>` is the whole state, so deep
  // links open the panel (map animates once mounted; a hard load before
  // style-load is a documented no-op — the seam is inert until MapView
  // subscribes).
  const lastPanelSlugRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastPanelSlugRef.current;
    lastPanelSlugRef.current = panelSlug;
    if (!panelSlug || panelSlug === prev) return;
    const town = resolveTown(panelSlug);
    if (town) requestFlyTo({ lon: town.lon, lat: town.lat, zoom: 9 });
  }, [panelSlug]);

  // W3-C2: ONE viewport-bounded alerts refresher per 5-min window lives HERE
  // (fetch-per-window law, same cadence as weather). It feeds the badge
  // alert-dots (MapBadges) AND the side-panel alert center — one poll drives
  // both surfaces, never a second poller. Last-data-wins: a failed window
  // keeps prior data; stale:true shows the honest 'last known' indicator.
  const boundsRef = useRef<GeoBounds>(ALERTS_INITIAL_BOUNDS);
  const alertState = useAlerts(() => boundsRef.current);

  // W3-B2: shared last-good temps/codes (one poll drives badges + panel).
  const [temps, setTemps] = useState<Readonly<Record<string, number>>>({});
  const [codes, setCodes] = useState<Readonly<Record<string, number>>>({});
  const handleTemps = useCallback((id: string, c: number) => {
    setTemps((prev) => (prev[id] === c ? prev : { ...prev, [id]: c }));
  }, []);
  const handleCodes = useCallback((id: string, code: number) => {
    setCodes((prev) => (prev[id] === code ? prev : { ...prev, [id]: code }));
  }, []);

  // Badge click: in-app navigation (push — back button closes the panel).
  // A raw <a> reload would reset zoom/pan (animation law) and drop the
  // panel's temps below the zoom-9 refresher gate.
  const openPanel = (slug: string) => navigate(panelOpenHref(location.search, slug));
  const closePanel = () => navigate(panelCloseHref(location.search), { replace: true });
  // W3-B3 CLICK-TO-DETAIL (session 2 decision 4): clicking a badge's alert
  // DOT goes straight to /alerts — deepest intent, no intermediate panel.
  const openAlerts = () => navigate('/alerts');

  // W4-C2 FEED-LOAD PREFETCH (ring law -> posts, session 2 law 3): hovering/
  // focusing any badge/label target prefetches that town's posts page 1.
  // The prefetch layer dedupes per key + LRU-caps to 3 towns, so this is a
  // fire-and-forget seam; prefetch keys (`prefetch:posts:*`) can never abort
  // a user request (`posts:*`) — the C1 supersession contract holds.
  const prefetchTown = useCallback((slug: string) => {
    prefetchTownPosts(slug)
  }, []);

  // Badge ids ARE canonical gazetteer slugs (townId === session.townSlug —
  // same slugify + 2dp rule), so one key feeds routing, feed, and alerts.
  const panelAlerts = panelSlug ? alertState.alerts.filter((a) => a.town === panelSlug) : [];

  return (
    <div className="map-layout">
      <section aria-labelledby="map-heading" className="map-page">
        <h1 id="map-heading">Map</h1>
        <MapView center={centerFromLocation()} zoom={3}>
          <MapBadges
            temps={temps}
            codes={codes}
            boundsRef={boundsRef}
            alertState={alertState}
            panelHrefFor={(id) => panelOpenHref(location.search, id)}
            onPanelOpen={openPanel}
            onAlertOpen={openAlerts}
            onTownFocus={prefetchTown}
            onTemps={handleTemps}
            onCodes={handleCodes}
          />
          {/* W3-B3 CLICK-TO-DETAIL: below the badge zoom grade, town/city/
              state LABELS and low-zoom dots get real clickable/focusable
              targets opening the SAME town panel (session 2 decision 4 —
              "no dead zones at any zoom level"). */}
          <MapTargets
            towns={TOWNS.towns.map((t) => ({
              id: townId(t.name, t.lat, t.lon),
              name: t.name,
              lat: t.lat,
              lon: t.lon,
              pop: t.pop,
            }))}
            panelHrefFor={(id) => panelOpenHref(location.search, id)}
            onPanelOpen={openPanel}
            onTownFocus={prefetchTown}
          />
        </MapView>
        <button
          type="button"
          className="panel-toggle map-panel-toggle"
          data-testid="panel-toggle"
          aria-label={panel.open ? 'Close side panel' : 'Open side panel'}
          aria-expanded={panel.open}
          onClick={panel.toggle}
        >
          {panel.open ? '»' : '«'}
        </button>
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
      <SidePanel open={panel.open} onToggle={panel.toggle} title={PANEL_TITLE}>
        <AlertCenter state={alertState} mode="panel" />
      </SidePanel>
    </div>
  );
}
