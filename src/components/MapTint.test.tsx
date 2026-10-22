// @vitest-environment jsdom
// W3-A3 MAP TINT — component tests: overlay renders only at/above zoom 9,
// class tracks the dominant condition, opacity respects the <=0.12 law.
import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MapContext, type MapLike } from '../lib/map/map-context'
import { MapTint } from './MapTint'
import { TINT_OPACITY } from '../lib/weather/map-tint'
import type { TownCoord } from '../lib/weather/openmeteo-batch'

const towns: TownCoord[] = [
  { id: 'springfield', name: 'Springfield', lat: 39.7817, lon: -89.6501 },
  { id: 'faraway', name: 'Faraway', lat: 44.9778, lon: -93.265 },
]

function stubMap(zoom: number): MapLike {
  return {
    project: ([lon, lat]) => ({ x: lon * -10, y: lat * 10 }),
    getZoom: () => zoom,
    getBounds: () => ({ west: -90, east: -89, south: 39, north: 40 }),
  }
}

describe('MapTint', () => {
  it('renders the dominant-condition overlay when zoomed in', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <MapTint towns={towns} temps={{ springfield: 25, faraway: 22 }} />
      </MapContext.Provider>,
    )
    const tint = screen.getByTestId('map-tint')
    expect(tint.getAttribute('data-condition')).toBe('clear')
    expect(tint.className).toContain('map-tint--clear')
  })

  it('renders NO overlay below zoom 9 (nothing to summarize)', () => {
    render(
      <MapContext.Provider value={stubMap(8.9)}>
        <MapTint towns={towns} temps={{ springfield: 25 }} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId('map-tint')).toBeNull()
  })

  it('renders NO overlay at zoom 9 when no visible town has data', () => {
    render(
      <MapContext.Provider value={stubMap(9)}>
        <MapTint towns={towns} temps={{}} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId('map-tint')).toBeNull()
  })

  it('picks the class for each dominant condition', () => {
    const cases: Array<[Record<string, number>, string]> = [
      [{ springfield: 31, faraway: 33 }, 'storm'],
      [{ springfield: 25, faraway: 20 }, 'clear'],
      [{ springfield: 5, faraway: 3 }, 'overcast'],
      [{ springfield: -2, faraway: -5 }, 'rain'],
      [{ springfield: -15, faraway: -20 }, 'snow'],
    ]
    for (const [temps, condition] of cases) {
      cleanup()
      render(
        <MapContext.Provider value={stubMap(10)}>
          <MapTint towns={towns} temps={temps} />
        </MapContext.Provider>,
      )
      const tint = screen.getByTestId('map-tint')
      expect(tint.getAttribute('data-condition')).toBe(condition)
      expect(tint.className).toBe(`map-tint map-tint--${condition}`)
    }
  })

  it('sets inline opacity within the <=0.12 law', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <MapTint towns={towns} temps={{ springfield: 25 }} />
      </MapContext.Provider>,
    )
    const tint = screen.getByTestId('map-tint')
    const op = Number(tint.style.opacity)
    expect(op).toBeGreaterThan(0)
    expect(op).toBeLessThanOrEqual(0.12)
    expect(op).toBe(TINT_OPACITY)
  })

  it('is aria-hidden (decorative wash, never announced)', () => {
    render(
      <MapContext.Provider value={stubMap(10)}>
        <MapTint towns={towns} temps={{ springfield: 25 }} />
      </MapContext.Provider>,
    )
    expect(screen.getByTestId('map-tint').getAttribute('aria-hidden')).toBe('true')
  })
})
