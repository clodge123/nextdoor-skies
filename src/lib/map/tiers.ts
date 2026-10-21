// L5 MAP-SHELL-GAZETTEER — zoom-tier control (country -> state -> city -> town).
// Pure, deterministic logic. No Math.random / Date.now / new Date (R17 law).

export type Tier = 'country' | 'state' | 'city' | 'town';

export interface TierRule {
  /** minimum population that places a town in this tier */
  minPop: number;
  /** basemap zoom at which this tier's labels become visible */
  minzoom: number;
  /** upper bound of the zoom band this tier owns (exclusive) */
  maxzoom: number;
}

/** Ordered highest-population-first. First match wins. */
export const TIER_RULES: ReadonlyArray<TierRule & { tier: Tier }> = [
  { tier: 'country', minPop: 1_000_000, minzoom: 1, maxzoom: 4 },
  { tier: 'state', minPop: 100_000, minzoom: 4, maxzoom: 7 },
  { tier: 'city', minPop: 10_000, minzoom: 7, maxzoom: 10 },
  { tier: 'town', minPop: 500, minzoom: 10, maxzoom: 24 },
];

export const TIERS: readonly Tier[] = ['country', 'state', 'city', 'town'];

/** Tier for a population. Populations below 500 have no tier (filtered out). */
export function tierForPopulation(pop: number): Tier | null {
  for (const rule of TIER_RULES) {
    if (pop >= rule.minPop) return rule.tier;
  }
  return null;
}

/** Which tier band a given map zoom currently belongs to (country->town as zoom rises). */
export function tierForZoom(zoom: number): Tier {
  if (zoom < 4) return 'country';
  if (zoom < 7) return 'state';
  if (zoom < 10) return 'city';
  return 'town';
}

/** minzoom for a tier (used to build symbol layers). */
export function minzoomForTier(tier: Tier): number {
  const rule = TIER_RULES.find((r) => r.tier === tier);
  if (!rule) throw new Error(`unknown tier: ${tier}`);
  return rule.minzoom;
}

/**
 * Coordinate-key debounce (~0.005 deg). Panning within a quantized cell
 * produces the same key, so subscribers cannot storm on every pan frame.
 */
export const COORD_KEY_STEP = 0.005;

export function coordKey(lat: number, lon: number, step: number = COORD_KEY_STEP): string {
  const q = (v: number): string => Math.round(v / step).toString();
  return `${q(lat)}:${q(lon)}`;
}
