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
