// L5 gazetteer data types + baked-town accessors. Deterministic, pure.
export interface TownPoint {
  name: string;
  lat: number;
  lon: number;
  pop: number;
  tier: 'country' | 'state' | 'city' | 'town';
}

export interface TownsFile {
  /** provenance: geonames-dump | bundled-sample */
  source: string;
  bakedVersion: 1;
  count: number;
  towns: TownPoint[];
}

/**
 * Nearest town to a coordinate (plain squared degree distance). Deterministic:
 * ties broken by higher pop, then name ascending, then lat, then lon.
 * Used by W3-IDENTITY to reverse-resolve geolocation to a gazetteer town.
 */
export function nearestTown(towns: TownPoint[], lat: number, lon: number): TownPoint {
  let best = towns[0];
  let bestD = (best.lat - lat) ** 2 + (best.lon - lon) ** 2;
  for (const t of towns) {
    const d = (t.lat - lat) ** 2 + (t.lon - lon) ** 2;
    if (
      d < bestD ||
      (d === bestD &&
        (t.pop > best.pop ||
          (t.pop === best.pop &&
            (t.name < best.name ||
              (t.name === best.name && (t.lat < best.lat || (t.lat === best.lat && t.lon < best.lon)))))))
    ) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** Filter towns to those inside a bbox (lon/lat) — used by L6 for visible-town selection. */
export function townsInBbox(
  towns: TownPoint[],
  west: number,
  south: number,
  east: number,
  north: number,
): TownPoint[] {
  return towns.filter(
    (t) => t.lon >= west && t.lon <= east && t.lat >= south && t.lat <= north,
  );
}
