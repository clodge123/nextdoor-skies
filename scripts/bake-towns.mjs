// L5 gazetteer bake: GeoNames cities500.zip + cities1000.zip -> data/towns/us-towns.json
// US entries only, population >= 500, tiered by pop (see src/lib/map/tiers.ts).
// Falls back to a bundled sample of 200 real US towns if the download fails.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.cache/geonames');
const outFile = join(root, 'data/towns/us-towns.json');
const MIN_POP = 500;

const TIER_RULES = [
  ['country', 1_000_000],
  ['state', 100_000],
  ['city', 10_000],
  ['town', 500],
];
const tierFor = (pop) => TIER_RULES.find(([, min]) => pop >= min)?.[0] ?? null;

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    // geonames fields (19-col dump): 0 id, 1 name, 4 lat, 5 lon, 8 country, 14 population
    if (f[8] !== 'US') continue;
    const pop = Number(f[14] || 0);
    if (!(pop >= MIN_POP)) continue;
    const lat = Number(f[4]);
    const lon = Number(f[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tier = tierFor(pop);
    if (!tier) continue;
    out.push({ name: f[1], lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, pop, tier });
  }
  return out;
}

function dedupeByLocation(towns) {
  const seen = new Map();
  for (const t of towns) {
    const k = `${t.lat}:${t.lon}`;
    if (!seen.has(k) || seen.get(k).pop < t.pop) seen.set(k, t);
  }
  return [...seen.values()].sort((a, b) => b.pop - a.pop);
}

function bakeFromDump() {
  const towns = [];
  for (const zip of ['cities500.zip', 'cities1000.zip']) {
    const path = join(cacheDir, zip);
    if (!existsSync(path)) throw new Error(`missing ${path}`);
    const text = execSync(`unzip -p ${JSON.stringify(path)}`, {
      maxBuffer: 512 * 1024 * 1024,
      encoding: 'utf8',
    });
    towns.push(...parseLines(text));
  }
  return dedupeByLocation(towns);
}

// Bundled fallback: 200 real US towns (name, lat, lon, pop) — documented in
// docs/metrics/L5-map.md. Used ONLY if the geonames download fails.
import { FALLBACK_TOWNS } from './fallback-towns.mjs';

let towns;
let source;
try {
  towns = bakeFromDump();
  source = 'geonames-dump:cities500+cities1000';
  if (towns.length < 500) throw new Error(`suspiciously few towns: ${towns.length}`);
} catch (err) {
  console.error(`[bake] geonames dump failed (${err.message}); using bundled sample of 200 real US towns`);
  towns = dedupeByLocation(
    FALLBACK_TOWNS.map(([name, lat, lon, pop]) => ({ name, lat, lon, pop, tier: tierFor(pop) })).filter((t) => t.tier),
  );
  source = 'bundled-sample-200';
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify({ source, bakedVersion: 1, count: towns.length, towns }),
) ;
console.log(`[bake] wrote ${outFile}: ${towns.length} towns from ${source}`);
for (const [tier] of TIER_RULES) {
  console.log(`  ${tier}: ${towns.filter((t) => t.tier === tier).length}`);
}
