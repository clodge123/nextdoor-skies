/**
 * L6 test app: a deterministic map stub (no MapLibre, no network in page)
 * that provides the map-context seam, town data, the weather refresher
 * (window.fetch mocked by Playwright route), and the TownBadges overlay.
 *
 * Used by tests/badges.spec.ts (Gate 1). The stub map is driven by buttons
 * (zoom in/out) so the browser test controls zoom deterministically.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { MapContext, type MapLike, type GeoBounds } from '../lib/map/map-context'
import { TownBadges } from '../components/TownBadges'
import {
  createWeatherRefresher,
  type CurrentTemp,
  type TownCoord,
} from '../lib/weather/openmeteo-batch'

const TOWNS: TownCoord[] = [
  { id: 'springfield', name: 'Springfield', lat: 39.7817, lon: -89.6501 },
  { id: 'riverside', name: 'Riverside', lat: 39.7612, lon: -89.6901 },
  { id: 'faraway', name: 'Faraway', lat: 44.9778, lon: -93.265 },
]

const CENTER: [number, number] = [-89.67, 39.77]

/** Stub map: zoom-graded projection around CENTER, deterministic. */
function createStubMap(): MapLike & { zoom: number; setZoom: (z: number) => void } {
  const handlers = new Map<string, Set<() => void>>()
  const state = { zoom: 3 }
  const size = () => {
    const el = document.getElementById('map')
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 }
  }
  const project = (lnglat: [number, number]) => {
    const { w, h } = size()
    const scale = Math.pow(2, state.zoom) * 8
    return {
      x: w / 2 + (lnglat[0] - CENTER[0]) * scale,
      y: h / 2 - (lnglat[1] - CENTER[1]) * scale,
    }
  }
  const bounds = (): GeoBounds => {
    const { w, h } = size()
    const scale = Math.pow(2, state.zoom) * 8
    const dx = w / 2 / scale
    const dy = h / 2 / scale
    return { west: CENTER[0] - dx, east: CENTER[0] + dx, south: CENTER[1] - dy, north: CENTER[1] + dy }
  }
  const map = {
    zoom: state.zoom,
    project,
    getZoom: () => state.zoom,
    getBounds: bounds,
    on(event: string, handler: () => void) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      return () => handlers.get(event)?.delete(handler)
    },
    setZoom(z: number) {
      state.zoom = z
      for (const ev of ['move', 'moveend', 'zoom']) {
        handlers.get(ev)?.forEach((f) => f())
      }
    },
  }
  return map
}

function App() {
  const mapRef = useRef<ReturnType<typeof createStubMap> | null>(null)
  if (!mapRef.current) mapRef.current = createStubMap()
  const map = mapRef.current

  const [zoom, setZoom] = useState(map.getZoom())
  const [temps, setTemps] = useState<Record<string, number>>({})

  const fetchImpl = useMemo(
    () =>
      (input: string, init: { method: string; headers: Record<string, string>; body: string }) =>
        window.fetch(input, init),
    [],
  )

  useEffect(() => {
    const refresher = createWeatherRefresher({
      getTowns: () => TOWNS,
      getViewport: () => map.getBounds(),
      fetchImpl,
      onTemps: (list: CurrentTemp[]) =>
        setTemps((prev) => {
          const next = { ...prev }
          for (const t of list) next[t.townId] = t.temperatureC
          return next
        }),
      intervalMs: 30_000, // test cadence; production default is 5 min
    })
    refresher.start()
    return () => refresher.stop()
  }, [map, fetchImpl])

  return (
    <div className="map-stub" id="map">
      <div className="map-controls">
        <button id="zoom-in" onClick={() => { map.setZoom(8); setZoom(8) }}>
          zoom in
        </button>
        <button id="zoom-out" onClick={() => { map.setZoom(3); setZoom(3) }}>
          zoom out
        </button>
      </div>
      <div data-testid="zoom-level" style={{ display: 'none' }}>{zoom}</div>
      {TOWNS.map((t) => {
        const p = map.project([t.lon, t.lat])
        return (
          <span key={t.id} className="town-label" style={{ left: `${p.x}px`, top: `${p.y}px` }}>
            {t.name}
          </span>
        )
      })}
      <MapContext.Provider value={map}>
        <TownBadges towns={TOWNS} temps={temps} />
      </MapContext.Provider>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
