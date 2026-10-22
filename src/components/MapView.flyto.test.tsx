// W3-B4 FLY-TO LAW — vitest gate: every search/badge/deep-link panel open
// animates the map, it never teleports. The seam (src/lib/map/fly-to.ts) is
// pure; MapView's subscriber is the one place maplibre's flyTo runs. These
// tests mount MapView over the standard maplibre mock (jsdom has no WebGL)
// and drive requestFlyTo through the seam, asserting the wave-1 animation
// law: eased flyTo, duration 1800ms (1.5-2s band), zoom clamped UP to >= 9
// (badge-visible level) so town targets land in view.
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers: Record<string, (e?: unknown) => void> = {};
const fakeMap = {
  on: vi.fn((ev: string, fn: (e?: unknown) => void) => {
    handlers[ev] = fn;
  }),
  off: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  flyTo: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 39.8, lng: -98.5 })),
  getZoom: vi.fn(() => 5),
  getContainer: vi.fn(() => ({ dataset: {} })),
  remove: vi.fn(),
};
vi.mock('maplibre-gl', () => ({
  default: { Map: vi.fn(() => fakeMap) },
}));

import MapView from './MapView';
import { requestFlyTo, subscribeFlyTo } from '../lib/map/fly-to';

describe('fly-to seam (pure channel)', () => {
  it('delivers requests to subscribers and unsubscribes cleanly', () => {
    const seen: Array<{ lon: number; lat: number }> = [];
    const off = subscribeFlyTo((req) => seen.push({ lon: req.lon, lat: req.lat }));
    requestFlyTo({ lon: -97.61, lat: 38.84 });
    expect(seen).toEqual([{ lon: -97.61, lat: 38.84 }]);
    off();
    requestFlyTo({ lon: 0, lat: 0 });
    expect(seen.length).toBe(1);
  });

  it('no-op with zero subscribers (no throw when no map is mounted)', () => {
    expect(() => requestFlyTo({ lon: 1, lat: 2 })).not.toThrow();
  });
});

describe('MapView fly-to animation law', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(handlers)) delete handlers[k];
  });

  it('flies (never snaps): flyTo with duration 1800 and zoom clamped up to 9', () => {
    render(<MapView />);
    act(() => {
      handlers.load?.();
    });
    // Seam request at zoom 9 (search select): eased flyTo, ~1.8s.
    act(() => {
      requestFlyTo({ lon: -97.6114, lat: 38.8403, zoom: 9 });
    });
    expect(fakeMap.flyTo).toHaveBeenCalledTimes(1);
    const call = fakeMap.flyTo.mock.calls[0][0] as {
      center: [number, number];
      zoom: number;
      duration: number;
    };
    expect(call.center).toEqual([-97.6114, 38.8403]);
    expect(call.zoom).toBeGreaterThanOrEqual(9);
    // Animation law: 1.5-2s eased — nothing snaps (duration present, sane).
    expect(call.duration).toBe(1800);
    expect(call.duration).toBeGreaterThanOrEqual(1500);
    expect(call.duration).toBeLessThanOrEqual(2000);
  });

  it('zoom below 9 clamps UP to 9 (badge-visible level, documented rule)', () => {
    render(<MapView />);
    act(() => {
      handlers.load?.();
    });
    fakeMap.getZoom.mockReturnValueOnce(3);
    act(() => {
      requestFlyTo({ lon: -98.5, lat: 39.8, zoom: 3 });
    });
    const call = fakeMap.flyTo.mock.calls[0][0] as { zoom: number };
    expect(call.zoom).toBe(9);
  });

  it('no flyTo when no request arrives (map motion is user-driven only)', () => {
    render(<MapView />);
    act(() => {
      handlers.load?.();
    });
    expect(fakeMap.flyTo).not.toHaveBeenCalled();
  });
});
