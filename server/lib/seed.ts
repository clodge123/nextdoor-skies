/**
 * L7 SEED-DEMO-INFRA — seed-once demo data mechanism (R14).
 *
 * Contract (docs/SEED-CONTRACT.md):
 * - Seed runs ONLY when the reports table/file is empty (seed-once).
 * - Every seeded row carries seeded:true so the UI can label it "Demo data".
 * - INSERT ... ON CONFLICT (id) DO NOTHING — deterministic ids, no dupes.
 * - Works against Postgres (POSTGRES_URL) and a REPORTS_FILE JSON fallback
 *   for tests (no prod Neon in tests).
 *
 * Determinism law (R17): this file is seed SIMULATION only. RNG is mulberry32
 * with a fixed constant seed; the wall-clock seed time arrives via the `now`
 * parameter (CLI passes new Date() at the process edge, which is legal —
 * this module contains no Math.random / Date.now / new Date() calls).
 */

export type WeatherType = 'rain' | 'storm' | 'snow' | 'clear' | 'heat';

export const VALID_TYPES: readonly WeatherType[] = ['rain', 'storm', 'snow', 'clear', 'heat'];

export interface ReportRow {
  id: string;
  town: string;
  lat: number;
  lon: number;
  type: WeatherType;
  body: string;
  author: string;
  /** ISO 8601 timestamp, always within 24h before the seed `now`. */
  ts: string;
  seeded: true;
}

export interface CommentRow {
  id: string;
  report_id: string;
  body: string;
  author: string;
  ts: string;
  seeded: true;
}

export interface SeedData {
  reports: ReportRow[];
  comments: CommentRow[];
}

export interface SeedOptions {
  postgresUrl?: string;
  reportsFile?: string;
  /** Seed time. Required: the CLI passes `new Date()` at the process edge; this module never reads the clock. */
  now: Date;
}

export interface SeedResult {
  seeded: boolean;
  posts: number;
  comments: number;
  reason?: string;
}

/** Fixed seed for the demo simulation. Never changes; keeps output reproducible. */
const SEED_RNG_SEED = 0x5eed1234;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/** mulberry32 — deterministic PRNG, allowed for seed sim only (R17). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Town {
  name: string;
  state: string;
  lat: number;
  lon: number;
  zone: WeatherType;
}

/** 30 real US towns (small-town fabric of a neighborhood app), real coords. */
export const TOWNS: readonly Town[] = [
  { name: 'Marfa', state: 'TX', lat: 30.3097, lon: -104.0199, zone: 'heat' },
  { name: 'Bisbee', state: 'AZ', lat: 31.4459, lon: -109.9253, zone: 'heat' },
  { name: 'Yuma', state: 'AZ', lat: 32.6927, lon: -114.6277, zone: 'heat' },
  { name: 'Palm Springs', state: 'CA', lat: 33.8303, lon: -116.5453, zone: 'heat' },
  { name: 'Sedona', state: 'AZ', lat: 34.8697, lon: -111.761, zone: 'heat' },
  { name: 'Talkeetna', state: 'AK', lat: 62.321, lon: -150.0956, zone: 'snow' },
  { name: 'Duluth', state: 'MN', lat: 46.7863, lon: -92.1005, zone: 'snow' },
  { name: 'Marquette', state: 'MI', lat: 46.5364, lon: -87.3898, zone: 'snow' },
  { name: 'Traverse City', state: 'MI', lat: 44.7631, lon: -85.6206, zone: 'snow' },
  { name: 'Sandpoint', state: 'ID', lat: 48.2775, lon: -116.5552, zone: 'snow' },
  { name: 'Ely', state: 'MN', lat: 47.9025, lon: -91.8686, zone: 'snow' },
  { name: 'Port Townsend', state: 'WA', lat: 48.117, lon: -122.7592, zone: 'rain' },
  { name: 'Astoria', state: 'OR', lat: 46.1879, lon: -123.8312, zone: 'rain' },
  { name: 'Mobile', state: 'AL', lat: 30.6954, lon: -88.0399, zone: 'rain' },
  { name: 'Anacortes', state: 'WA', lat: 48.511, lon: -122.6127, zone: 'rain' },
  { name: 'Hoquiam', state: 'WA', lat: 46.9786, lon: -123.8784, zone: 'rain' },
  { name: 'St. Augustine', state: 'FL', lat: 29.8947, lon: -81.3147, zone: 'rain' },
  { name: 'Chattanooga', state: 'TN', lat: 35.0456, lon: -85.3097, zone: 'storm' },
  { name: 'Tulsa', state: 'OK', lat: 36.154, lon: -95.9928, zone: 'storm' },
  { name: 'Topeka', state: 'KS', lat: 39.0558, lon: -95.6751, zone: 'storm' },
  { name: 'Wichita Falls', state: 'TX', lat: 33.9137, lon: -98.4934, zone: 'storm' },
  { name: 'Peoria', state: 'IL', lat: 40.6936, lon: -89.589, zone: 'storm' },
  { name: 'Fargo', state: 'ND', lat: 46.8772, lon: -96.789, zone: 'storm' },
  { name: 'Flagstaff', state: 'AZ', lat: 35.1983, lon: -111.6513, zone: 'clear' },
  { name: 'Taos', state: 'NM', lat: 36.4072, lon: -105.5731, zone: 'clear' },
  { name: 'Santa Fe', state: 'NM', lat: 35.687, lon: -105.9378, zone: 'clear' },
  { name: 'Bozeman', state: 'MT', lat: 45.677, lon: -111.0429, zone: 'clear' },
  { name: 'Boulder', state: 'CO', lat: 40.015, lon: -105.2705, zone: 'clear' },
  { name: 'Las Cruces', state: 'NM', lat: 32.3199, lon: -106.7637, zone: 'clear' },
  { name: 'Cedar City', state: 'UT', lat: 37.6775, lon: -113.0619, zone: 'clear' },
];

const AUTHORS = [
  'marisol_k', 'devon.p', 'oldliney', 'maplestory', 'rainmaker_rita',
  'grizzley', 'prairie_wolf', 'jo.nolan', 'tallpine', 'sunnydaze',
  'harborlight', 'wrenwood', 'cobblepot', 'dustdevil', 'silverton', 'bluejay',
];

const POST_TEMPLATES: Record<WeatherType, string[]> = {
  rain: [
    'Rain again here — the creek on the edge of town is rising. Drive safe.',
    'Pavement slick on Main St since this morning. Bring an umbrella.',
    'Drizzle all day. The farmers market tents are soaked through.',
    'Finally some rain. Gardens in {town} are thanking us.',
  ],
  storm: [
    'Hear thunder over the ridge. Basement sump is running, just the usual.',
    'Storm cell parked over {town} — power flickered twice. Anyone else?',
    'Sky looks mean to the west. Lightning strikes counted: four so far.',
    'Wind gusts knocking branches down on Elm Ave. Watch for falling limbs.',
  ],
  snow: [
    'First flakes down already. Plows have been quiet so far.',
    'Six inches on the ground at the edge of {town}. Ski trails are calling.',
    'Icy bridges on the way in — go slow if you must drive.',
    'Snow day confirmed. The diner is doing a stew special.',
  ],
  clear: [
    'Blue skies, no wind. Everyone outside in {town} today.',
    'Perfect clear evening — sunset over the ridge was unreal.',
    'Dry and bright. Wildfire smoke levels here are zero, enjoy it.',
    'Clear and crisp. Farmers market packed, no complaints.',
  ],
  heat: [
    'Triple digits by noon. Sprinklers running on every lawn in {town}.',
    'Heat advisory out. Fountain in the square is the town lifeline.',
    'Night temps barely drop. If you have elders nearby, check on them.',
    'Dry heat, dry creek beds. Water conservation reminders posted.',
  ],
};

const COMMENT_TEMPLATES = [
  'Same here, thanks for the heads up!',
  'Watching it from my porch right now.',
  'Stay safe out there, everyone.',
  'Can confirm, saw it from the highway.',
  'Appreciate the update, neighbor.',
  'My kid asked me to warn everyone. So, warning issued.',
  'This is why I moved to {town}. Community.',
  'Glad someone posted. Thought I imagined it.',
  'Sending warm soup your way.',
  'Update when it passes? Following along.',
  'Ha! The {town} weather mood, as always.',
  'Noted. Keeping the flashlight by the door tonight.',
];

/** Build the full deterministic demo dataset for a given seed time. */
export function buildSeedData(now: Date): SeedData {
  const rng = mulberry32(SEED_RNG_SEED);
  const reports: ReportRow[] = [];
  const comments: CommentRow[] = [];
  const nowMs = now.getTime();

  TOWNS.forEach((town, i) => {
    const label = `${town.name}, ${town.state}`;
    // 75% zone-appropriate type, 25% any type (variety across the map).
    const type: WeatherType =
      rng() < 0.75 ? town.zone : VALID_TYPES[Math.floor(rng() * VALID_TYPES.length)]!;
    const templates = POST_TEMPLATES[type]!;
    const body = templates[Math.floor(rng() * templates.length)]!.replaceAll('{town}', town.name);
    const author = AUTHORS[Math.floor(rng() * AUTHORS.length)]!;
    const ageMs = Math.floor(rng() * DAY_MS / MIN_MS) * MIN_MS; // 0..24h, minute-rounded
    const ts = new Date(nowMs - ageMs).toISOString();

    reports.push({
      id: `seed-post-${i}`,
      town: label,
      lat: town.lat,
      lon: town.lon,
      type,
      body,
      author,
      ts,
      seeded: true,
    });

    // 3-6 one-level comments per post, all ts between post ts and seed time.
    const n = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) {
      const cAgeMs = Math.floor(rng() * ageMs / MIN_MS) * MIN_MS;
      const cBody = COMMENT_TEMPLATES[Math.floor(rng() * COMMENT_TEMPLATES.length)]!.replaceAll(
        '{town}',
        town.name,
      );
      comments.push({
        id: `seed-comment-${i}-${j}`,
        report_id: `seed-post-${i}`,
        body: cBody,
        author: AUTHORS[Math.floor(rng() * AUTHORS.length)]!,
        ts: new Date(nowMs - cAgeMs).toISOString(),
        seeded: true,
      });
    }
  });

  return { reports, comments };
}

/** Schema for reports + comments (also shipped as server/migrations/001_reports.sql). */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  town TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rain','storm','snow','clear','heat')),
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  seeded BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  seeded BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS reports_ts_idx ON reports (ts DESC);
CREATE INDEX IF NOT EXISTS comments_report_idx ON comments (report_id, ts);
`;

interface FileShape {
  version: 1;
  reports: ReportRow[];
  comments: CommentRow[];
}

async function seedFile(opts: SeedOptions, now: Date): Promise<SeedResult> {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const { dirname, resolve } = await import('node:path');
  const path = resolve(opts.reportsFile!);

  let store: FileShape = { version: 1, reports: [], comments: [] };
  try {
    store = JSON.parse(await readFile(path, 'utf8')) as FileShape;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  if (store.reports.length > 0) {
    return {
      seeded: false,
      posts: store.reports.length,
      comments: store.comments.length,
      reason: 'reports file not empty — seed-once, skipping',
    };
  }

  const data = buildSeedData(now);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ ...store, ...data }, null, 2), 'utf8');
  return { seeded: true, posts: data.reports.length, comments: data.comments.length };
}

async function seedPostgres(url: string, now: Date): Promise<SeedResult> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(MIGRATION_SQL);
    const { rows } = await client.query<{ n: string }>('SELECT count(*)::int AS n FROM reports');
    const existing = Number(rows[0]?.n ?? 0);
    if (existing > 0) {
      return {
        seeded: false,
        posts: existing,
        comments: 0,
        reason: 'reports table not empty — seed-once, skipping',
      };
    }

    const data = buildSeedData(now);
    const postValues = data.reports
      .map(
        (r) =>
          `(${JSON.stringify(r.id)}, ${JSON.stringify(r.town)}, ${r.lat}, ${r.lon}, ` +
          `${JSON.stringify(r.type)}, ${JSON.stringify(r.body)}, ${JSON.stringify(r.author)}, ` +
          `CAST(${JSON.stringify(r.ts)} AS timestamptz), TRUE)`,
      )
      .join(',\n');
    await client.query(
      `INSERT INTO reports (id, town, lat, lon, type, body, author, ts, seeded)
       VALUES ${postValues}
       ON CONFLICT (id) DO NOTHING`,
    );

    const commentValues = data.comments
      .map(
        (c) =>
          `(${JSON.stringify(c.id)}, ${JSON.stringify(c.report_id)}, ${JSON.stringify(c.body)}, ` +
          `${JSON.stringify(c.author)}, CAST(${JSON.stringify(c.ts)} AS timestamptz), TRUE)`,
      )
      .join(',\n');
    await client.query(
      `INSERT INTO comments (id, report_id, body, author, ts, seeded)
       VALUES ${commentValues}
       ON CONFLICT (id) DO NOTHING`,
    );

    return { seeded: true, posts: data.reports.length, comments: data.comments.length };
  } finally {
    await client.end();
  }
}

/**
 * Seed-once entry point. Postgres wins when both options are set.
 * Returns seeded:false (with reason) when the store already has reports.
 */
export async function seedOnce(opts: SeedOptions): Promise<SeedResult> {
  const now = opts.now;
  if (opts.postgresUrl) return seedPostgres(opts.postgresUrl, now);
  if (opts.reportsFile) return seedFile(opts, now);
  throw new Error('seedOnce: set POSTGRES_URL or REPORTS_FILE');
}
