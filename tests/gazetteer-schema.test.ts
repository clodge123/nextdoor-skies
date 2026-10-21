import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tierForPopulation } from '../src/lib/map/tiers';
import type { TownPoint } from '../src/lib/map/gazetteer';

// JSON schema gate for the baked gazetteer (data/towns/us-towns.json).
const raw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/towns/us-towns.json'), 'utf8'),
) as {
  source: string;
  bakedVersion: number;
  count: number;
  towns: TownPoint[];
};

describe('us-towns.json schema', () => {
  it('has top-level provenance fields', () => {
    expect(typeof raw.source).toBe('string');
    expect(raw.bakedVersion).toBe(1);
    expect(raw.count).toBe(raw.towns.length);
    expect(raw.count).toBeGreaterThanOrEqual(200);
  });

  it('every town matches the row schema', () => {
    // Aggregate scan (21k+ rows): collect violations, assert none. Per-row
    // expect() calls would blow the timeout on this many rows.
    const bad = raw.towns.filter(
      (t) =>
        typeof t.name !== 'string' ||
        t.name.length === 0 ||
        !(t.lat >= 17 && t.lat <= 72) ||
        !(t.lon >= -180 && t.lon <= -65) ||
        !Number.isInteger(t.pop) ||
        t.pop < 500 ||
        !['country', 'state', 'city', 'town'].includes(t.tier),
    );
    expect(bad.slice(0, 3)).toEqual([]);
    expect(bad.length).toBe(0);
  });

  it('tier matches population band', () => {
    const bad = raw.towns.filter((t) => tierForPopulation(t.pop) !== t.tier);
    expect(bad.slice(0, 3)).toEqual([]);
    expect(bad.length).toBe(0);
  });

  it('all towns are unique locations', () => {
    const keys = raw.towns.map((t) => `${t.lat}:${t.lon}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
