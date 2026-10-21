import { describe, expect, it } from 'vitest';
import {
  coordKey,
  minzoomForTier,
  tierForPopulation,
  tierForZoom,
  TIER_RULES,
} from './tiers';

describe('tierForPopulation (country->state->city->town)', () => {
  it('maps population bands to tiers', () => {
    expect(tierForPopulation(5_000_000)).toBe('country');
    expect(tierForPopulation(1_000_000)).toBe('country');
    expect(tierForPopulation(999_999)).toBe('state');
    expect(tierForPopulation(100_000)).toBe('state');
    expect(tierForPopulation(99_999)).toBe('city');
    expect(tierForPopulation(10_000)).toBe('city');
    expect(tierForPopulation(9_999)).toBe('town');
    expect(tierForPopulation(500)).toBe('town');
  });
  it('drops populations below 500', () => {
    expect(tierForPopulation(499)).toBeNull();
    expect(tierForPopulation(0)).toBeNull();
  });
});

describe('tierForZoom (zoom-band -> tier)', () => {
  it('maps zoom bands monotonically', () => {
    expect(tierForZoom(1)).toBe('country');
    expect(tierForZoom(3.9)).toBe('country');
    expect(tierForZoom(4)).toBe('state');
    expect(tierForZoom(6.9)).toBe('state');
    expect(tierForZoom(7)).toBe('city');
    expect(tierForZoom(9.9)).toBe('city');
    expect(tierForZoom(10)).toBe('town');
    expect(tierForZoom(18)).toBe('town');
  });
});

describe('tier rules invariants', () => {
  it('minzoom increases with tier rank and covers the full zoom range', () => {
    const zooms = TIER_RULES.map((r) => minzoomForTier(r.tier));
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]).toBeGreaterThan(zooms[i - 1]);
    expect(minzoomForTier('town')).toBe(10);
    expect(TIER_RULES[TIER_RULES.length - 1].maxzoom).toBeGreaterThanOrEqual(18);
  });
});

describe('coordKey debounce (~0.005 deg, law #7)', () => {
  it('quantizes to the same key within one cell', () => {
    const k1 = coordKey(39.8, -98.5);
    expect(coordKey(39.8001, -98.5001)).toBe(k1); // tiny pan -> same key
  });
  it('changes key beyond one cell', () => {
    expect(coordKey(39.8, -98.5)).not.toBe(coordKey(39.82, -98.5));
  });
});
