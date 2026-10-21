import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock maplibre-gl: jsdom has no WebGL; we assert the shell wires layers/events.
const handlers: Record<string, (e?: unknown) => void> = {};
const fakeMap = {
  on: vi.fn((ev: string, fn: (e?: unknown) => void) => {
    handlers[ev] = fn;
  }),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 39.8, lng: -98.5 })),
  getZoom: vi.fn(() => 11),
  getContainer: vi.fn(() => ({ dataset: {} })),
  remove: vi.fn(),
};
vi.mock('maplibre-gl', () => ({
  default: { Map: vi.fn(() => fakeMap) },
}));

import MapView from './MapView';

describe('MapView shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(handlers)) delete handlers[k];
  });

  it('renders the map container with production basemap marker', () => {
    render(<MapView />);
    const el = screen.getByTestId('map-view');
    expect(el).toBeInTheDocument();
    expect(el.dataset.mapStyle).toBe('openfreemap-bright');
    expect(el.dataset.tileWarnings).toBe('0');
  });

  it('adds gazetteer source + 4 tier symbol layers on load', () => {
    render(<MapView />);
    handlers.load?.();
    expect(fakeMap.addSource).toHaveBeenCalledWith(
      'nds-towns',
      expect.objectContaining({ type: 'geojson' }),
    );
    const layers = fakeMap.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(layers).toEqual(['nds-labels-country', 'nds-labels-state', 'nds-labels-city', 'nds-labels-town']);
    const townLayer = fakeMap.addLayer.mock.calls.map((c) => c[0] as { id: string; minzoom: number }).find((l) => l.id === 'nds-labels-town')!;
    expect(townLayer.minzoom).toBe(10);
  });

  it('counts tile errors as warnings without flipping UI', () => {
    render(<MapView />);
    act(() => {
      handlers.error?.({ sourceType: 'tile' });
      handlers.error?.({ sourceType: 'tile' });
    });
    const el = screen.getByTestId('map-view');
    expect(el.dataset.tileWarnings).toBe('2');
  });
});
