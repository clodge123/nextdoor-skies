// @vitest-environment jsdom
// W3-B3 CLICK-TO-DETAIL — unit coverage for the below-zoom-9 label/dot
// targets (session 2 decision 4: "no dead zones at any zoom level").
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MapContext, type MapLike } from '../src/lib/map/map-context'
import { TownLabelTargets, targetsForZoom } from '../src/components/TownLabelTargets'
import type { TownTargetCoord } from '../src/components/TownLabelTargets'

const towns: TownTargetCoord[] = [
  { id: 'metropolis-40.00--88.00', name: 'Metropolis', lat: 40, lon: -88, pop: 2_000_000 },
  { id: 'springfield-39.78--89.65', name: 'Springfield', lat: 39.7817, lon: -89.6501, pop: 11_700 },
  { id: 'smalltown-41.00--92.00', name: 'Smalltown', lat: 41, lon: -92, pop: 800 },
]

function stubMap(zoom: number): MapLike {
  return {
    project: ([lon, lat]) => ({ x: lon * -10, y: lat * 10 }),
    getZoom: () => zoom,
    getBounds: () => ({ west: -100, east: -85, south: 35, north: 45 }),
  }
}

describe('TownLabelTargets (W3-B3 click-to-detail)', () => {
  it('renders nothing at/above the badge zoom grade (badges own that range)', () => {
    render(
      <MapContext.Provider value={stubMap(9)}>
        <TownLabelTargets towns={towns} panelHrefFor={(id) => `/?panel=${id}`} />
      </MapContext.Provider>,
    )
    expect(screen.queryByTestId('town-label-targets')).toBeNull()
    expect(screen.queryByTestId('town-target-springfield-39.78--89.65')).toBeNull()
  })

  it('renders focusable links for the current zoom band below zoom 9', () => {
    render(
      <MapContext.Provider value={stubMap(8)}>
        <TownLabelTargets towns={towns} panelHrefFor={(id) => `/?panel=${id}`} />
      </MapContext.Provider>,
    )
    const target = screen.getByTestId('town-target-springfield-39.78--89.65')
    // Honest accessible affordance: real anchor (role link/button semantics,
    // keyboard focusable via tabIndex), named by aria-label.
    expect(target.tagName).toBe('A')
    expect(target).toHaveAttribute('href', '/?panel=springfield-39.78--89.65')
    expect(target).toHaveAttribute('data-panel', '1')
    expect(target).toHaveAttribute('aria-label', 'Open Springfield town panel')
    expect(target.className).toContain('town-target')
    // City band: the 2M-pop metro is a STATE-tier town at this zoom — out.
    expect(screen.queryByTestId('town-target-metropolis-40.00--88.00')).toBeNull()
    expect(screen.queryByTestId('town-target-smalltown-41.00--92.00')).toBeNull()
  })

  it('plain click routes through onPanelOpen (SPA, no reload); modifiers pass through', () => {
    const onPanelOpen = vi.fn()
    render(
      <MapContext.Provider value={stubMap(8)}>
        <TownLabelTargets
          towns={towns}
          panelHrefFor={(id) => `/?panel=${id}`}
          onPanelOpen={onPanelOpen}
        />
      </MapContext.Provider>,
    )
    const target = screen.getByTestId('town-target-springfield-39.78--89.65')
    fireEvent.click(target, { button: 0 })
    expect(onPanelOpen).toHaveBeenCalledWith('springfield-39.78--89.65')
    // Modifier click: real-link power preserved (no preventDefault, no call).
    onPanelOpen.mockClear()
    fireEvent.click(target, { button: 0, ctrlKey: true })
    expect(onPanelOpen).not.toHaveBeenCalled()
  })

  it('without panel wiring the targets are honest inert buttons (no href)', () => {
    render(
      <MapContext.Provider value={stubMap(8)}>
        <TownLabelTargets towns={towns} />
      </MapContext.Provider>,
    )
    const target = screen.getByTestId('town-target-springfield-39.78--89.65')
    expect(target.tagName).toBe('BUTTON')
    expect(target).not.toHaveAttribute('href')
    expect(target).toHaveAttribute('aria-label', 'Open Springfield town panel')
  })

  it('positions targets via map.project()', () => {
    render(
      <MapContext.Provider value={stubMap(8)}>
        <TownLabelTargets towns={towns} panelHrefFor={(id) => `/?panel=${id}`} />
      </MapContext.Provider>,
    )
    const target = screen.getByTestId('town-target-springfield-39.78--89.65')
    expect(target.getAttribute('style')).toContain('left: 896.501px')
    expect(target.getAttribute('style')).toContain('top: 397.817px')
  })

  it('throws the documented seam error without map context', () => {
    expect(() => render(<TownLabelTargets towns={towns} />)).toThrow(/no map instance/)
  })
})

describe('targetsForZoom (pure tier-band selection)', () => {
  it('keeps only towns whose population tier matches the zoom band', () => {
    expect(targetsForZoom(towns, 3).map((t) => t.id)).toEqual(['metropolis-40.00--88.00'])
    expect(targetsForZoom(towns, 6).map((t) => t.id)).toEqual([])
    expect(targetsForZoom(towns, 8).map((t) => t.id)).toEqual(['springfield-39.78--89.65'])
    expect(targetsForZoom(towns, 11).map((t) => t.id)).toEqual(['smalltown-41.00--92.00'])
  })

  it('ranks by population and caps the DOM (deterministic tie-break)', () => {
    const many: TownTargetCoord[] = Array.from({ length: 150 }, (_, i) => ({
      id: `city-${i}`,
      name: `City ${i}`,
      lat: 40,
      lon: -90,
      pop: 10_000 + (i % 2 ? 1 : 0), // ties force the name tie-break
    }))
    const picked = targetsForZoom(many, 8)
    expect(picked.length).toBeLessThanOrEqual(100)
    // Deterministic: same input, same output, every time.
    expect(targetsForZoom(many, 8)).toEqual(picked)
  })
})
