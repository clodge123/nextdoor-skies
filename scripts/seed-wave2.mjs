#!/usr/bin/env node
/**
 * W7 SEED — wave-2 production demo seeder (owner-approved, runs ONCE).
 *
 * Populates the production feed so the app demos with real value:
 *   20 metro areas x 5-10 posts each (real canvas snapshots via the app's
 *   map, src/lib/snapshot.ts pattern replicated in-page), plus ~15 small
 *   towns x 2 text-only posts.
 *
 * Law compliance:
 * - Playwright ONLY through scripts/e2e-gate.sh (browser traffic law).
 * - Determinism (R17): zero Math.random / Date.now / new Date. Text is
 *   authored per town with index-based rotation; nicknames rotate through
 *   a fixed friendly-name pool. Ids + timestamps arrive from the SERVER
 *   (api/posts.js), never from this script.
 * - Rate limit (S2: 5 posts/hour/IP): LIVE-VERIFIED 2026-10-21 — Vercel
 *   overwrites client-sent x-forwarded-for, so the limiter keys on the real
 *   peer IP and exactly 5 posts/hour succeed from this host. XFF rotation
 *   does NOT bypass it (probes 429 from the first request). Two sanctioned
 *   paths:
 *     1. Staggered: --limit N per invocation, one invocation per hour
 *        (rate-aware chain; town-skip makes each hour fill the next town).
 *     2. Direct-DB: --db inserts the same deterministic rows straight into
 *        Neon with POSTGRES_URL (wave-1 L7 seed precedent, process-edge
 *        clock). For the orchestrator with the production secret.
 * - Idempotent-safe: GET /api/posts?town=<slug> first; towns with existing
 *   posts are skipped entirely.
 *
 * Session (S1): x-nds-session = JSON {nickname, townSlug, townName}; the
 * canonical slug is slugify(name)-<lat2dp>-<lon2dp> (MapPage.townId). The
 * browser also persists the same session into localStorage 'nds-session'
 * (the app's own seam) before the map visit, per the lane brief.
 *
 * Usage:
 *   node --check scripts/seed-wave2.mjs
 *   scripts/e2e-gate.sh node scripts/seed-wave2.mjs --dry     # plan only
 *   scripts/e2e-gate.sh node scripts/seed-wave2.mjs           # real seed
 *
 * Modes (W3-D2, C7/C8 fixes):
 *   (default)   seed posts per plan (wave-2 behavior, unchanged).
 *   --reseed    recapture snapshots for metro towns with the PAINT-FIXED
 *               capture (style load + idle + rAF + variance gate, C7) and
 *               PATCH the existing posts IN PLACE via the admin route
 *               (PATCH /api/posts?path=<id>, x-nds-admin secret). Requires
 *               NDS_ADMIN_SECRET deployed on the target (wave-end deploy
 *               gate; honest 503 report when unset). Owner decision:
 *               keep the 177 posts, patch their black canvases.
 *   --engagement seed reactions + comments on ALL seeded posts via the real
 *               API (C8: Hot view was dead — zero engagement). Deterministic
 *               fixed pattern per post index (no Math.random/Date.now):
 *               3-8 reactions (3 + i%6) + 0-3 comments (i%4). Idempotent:
 *               GETs current counts and tops up to the target only.
 *
 * Proxy law (host environment): node-side NO_PROXY='*' + browser
 * --no-proxy-server, direct egress to vercel.app (smoke-prod precedent).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const BASE = (process.env.SEED_BASE_URL ?? 'https://nextdoor-skies-run2.vercel.app').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry');
const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- gazetteer ---

const towns = JSON.parse(readFileSync(resolve(here, '../data/towns/us-towns.json'), 'utf8')).towns;

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function round2(n) {
  return String(Math.round(n * 100) / 100);
}
/** Canonical session slug (MapPage.townId / session.townSlug). */
function townSlug(t) {
  return `${slugify(t.name)}-${round2(t.lat)}-${round2(t.lon)}`;
}
/** Highest-pop gazetteer entry for a name (session.ts pickTownSlug rule). */
function pickTown(name) {
  const hits = towns.filter((t) => t.name === name);
  if (!hits.length) throw new Error(`gazetteer miss: ${name}`);
  return hits.reduce((a, b) => (b.pop > a.pop ? b : a));
}

// ------------------------------------------------------------------ roster ---

/** 20 metro areas: 8 authored weather-chatter strings each, 6-10 posts. */
const METROS = [
  { name: 'New York City', posts: 8, texts: [
    'Fog rolled in off the harbor overnight and burned off by mid-morning — the bridges came back like a switch flipped.',
    'First real cold snap of the fall; the wind off the water cuts right through you on the platform.',
    'Afternoon downpour turned the streets near the park slick fast, mind the crosswalks.',
    'That classic late-summer gray sky, the kind that makes the whole block walk a little faster.',
    'Flurries swirling up after dark — not enough to stick, just enough to complain about.',
    'Muggy morning, felt like the neighborhood was holding its breath.',
    'Clear and crisp tonight, skyline sharper than it has been in weeks.',
    'Gusts knocked every umbrella inside out at the sidewalk cafes.',
  ] },
  { name: 'Los Angeles', posts: 8, texts: [
    'Marine layer burned off by noon, finally got to see the mountains from the freeway again.',
    'Santa Ana winds are back — everything feels drier by the hour, keep an eye on the fire alerts.',
    'Surprise rain in the afternoon, first drops in months and the whole city stopped to stare.',
    'Coastal fog bank sat right on the beach towns all morning, thick as cotton.',
    'Heat wave easing off at last, evenings on the patio are civil again.',
    'Sky turned a bruised purple before the storm cell pushed through, big lightning over the ridge.',
    'Gray and drizzly, feels apologetic for being Los Angeles.',
    'Perfect 70-day, the kind of weather that makes everyone plan a hike.',
  ] },
  { name: 'Chicago', posts: 8, texts: [
    'Hawk wind howling off the lake, felt ten degrees colder walking to the train.',
    'Lake-effect snow bands parked over the north side all night, plows everywhere by morning.',
    'Humidity so thick the L platforms felt like soup, everyone standing under the vents.',
    'Tornado warning downtown at lunch, clear skies while the siren went off, classic.',
    'Indian summer in full swing, the lakefront paths are shoulder to shoulder.',
    'Freezing rain made the sidewalks glass, saw three people sliding to the bus stop.',
    'Dew point dropped overnight and the air smells like woodsmoke and change.',
    'Golden hour stretched forever, the whole skyline lit up like a postcard.',
  ] },
  { name: 'Houston', posts: 8, texts: [
    '95 by 10 a.m. and climbing, the heat index is doing something personally offensive.',
    'Pop-up storm dumped a foot on the west side in an hour, freeways turned into rivers.',
    'Dew point is off the charts, breathing feels optional.',
    'Drought dust covering everything, the sunsets are spectacular and apocalyptic.',
    'Cold front came through overnight and you could feel the whole city exhale.',
    'Humid start to the week, rain chances building by the afternoon as usual.',
    'Sky cleared out for the first time in days, big blue nothing overhead.',
    'Storm season practice run — the radar loop looked like a wall of red.',
  ] },
  { name: 'Dallas', posts: 7, texts: [
    'Dry front pushed through, temperature took a nosedive and the sky cleared.',
    'Hail rattled the roofs for ten minutes, biggest flakes of the season.',
    'Triple-digit heat finally broke, evenings are worth sitting outside for.',
    'Overcast all day with that heavy feeling, rain all but guaranteed by evening.',
    'Windy start to the week, the forecast says it is not done with us.',
    'First freeze advisory of the year, remember to drain the hoses.',
    'Crisp and bright, the kind of October day they brag about in Texas.',
  ] },
  { name: 'Miami', posts: 8, texts: [
    'Rain at 2, rain at 4, rain at 6 — the afternoon shower schedule is back on time.',
    'Sea breeze kicked in around noon, the only mercy in a furnace week.',
    'Squall line rolled in off the coast, lightning lit up the whole bay.',
    'Muggy beyond belief, the whole city is a sauna with palm trees.',
    'Blue skies, flat light, the kind of day that makes you cancel your plans for the beach.',
    'Storm surge flooding on the bay streets, tide tables worth checking this week.',
    'Cold front snuck down the coast and dropped the wind to the north, jacket weather, finally.',
    'Fog on the causeway at dawn, whiteout quiet, cars crawling with lights on.',
  ] },
  { name: 'Seattle', posts: 8, texts: [
    'First proper rain of the season, the city collectively sighed and bought new umbrellas.',
    'Drizzle all day, the kind that is not really rain, just the air deciding to be wet.',
    'Rare blue-sky day, every trailhead in the Cascades is a parking lot.',
    'Wind off the sound knocked over the patio heaters downtown.',
    'Fog in the morning, sun by lunch, the classic Seattle magic trick.',
    'Atmospheric river on the way, forecasts talking about the mountains.',
    'Dusk came early, the rain on the windows makes the coffee shops look cinematic.',
    'Cold snap, first frost on the car windshields, winter is knocking.',
  ] },
  { name: 'Atlanta', posts: 7, texts: [
    'Peach-tree humidity in full effect, standing still is a workout.',
    'Afternoon thunderheads stacked up over the perimeter, boom, boom, done in twenty minutes.',
    'Fall colors starting early on the mountain drives, the weekend forecast is perfect.',
    'Pollen count is a public safety issue right now, the cars are yellow.',
    'Cold front rolled through, sudden dry air, the whole city exhaled.',
    'Dense fog by the river, the drive downtown was a white-knuckle crawl.',
    'Drought talk at the neighborhood meetings, lawn watering restrictions are back.',
  ] },
  { name: 'Boston', posts: 8, texts: [
    'Nor’easter on the radar, everyone suddenly remembers how to stock the pantry.',
    'Wind off the harbor, the ferries are canceling and the bridges whistle.',
    'Leaf season in peak glory, the Common is a carpet of gold.',
    'First snow flurries swirled in on the sea breeze, gone in minutes.',
    'Black ice on the side streets this morning, walk like a penguin.',
    'Damp fog rolled off the bay, the city looked like a painting no one ordered.',
    'First real freeze tonight, cover the tomatoes, bring in the hoses.',
    'Crisp and bright with that sharp New England light, walking season is back.',
  ] },
  { name: 'Phoenix', posts: 7, texts: [
    'Monsoon moisture building, dust devils spinning across the empty lots.',
    'The dry heat is finally dry-dry, shade is the whole game.',
    'Haboob swallowed the sky, visibility dropped to zero in fifteen minutes.',
    'Cool morning, jacket weather on the patio, the desert showing off.',
    'High clouds all day, the sunsets on the ridge are on fire.',
    'Overnight temps dropped below freezing in the valley, the cactus does not care.',
    'Heat dome on the news, the AC is the heartbeat of the city.',
  ] },
  { name: 'Philadelphia', posts: 7, texts: [
    'Dew point high, the riverfront felt like walking through a towel.',
    'Fall foliage on the Schuylkill trail is peak gorgeous, forecast says stay sunny.',
    'Cold rain sideways off the Delaware, the rowhomes steamed.',
    'Blue jay sky, flat and bright, everybody took their lunch outside.',
    'Snowmageddon memes on the group chat, the forecast says eleven inches, we will see.',
    'Wind gusts along the waterfront, the ferries are white-knuckling it.',
    'First frost on the community garden beds, garlic is tougher than it looks.',
  ] },
  { name: 'San Antonio', posts: 7, texts: [
    'Heat dome vibes, the River Walk is the only sensible place to be.',
    'Late-evening thunderstorms rolling in, the rain smells like creosote.',
    'Dry spell dragging on, the hills are the color of toast.',
    'Cold front swept through, river water steaming, jacket weather for a week.',
    'Fog on the river at sunrise, herons standing in the mist.',
    'Hail lathered the rooftops, first big one since spring.',
    'Perfect 80-degree day, patios everywhere, the city is outside.',
  ] },
  { name: 'San Diego', posts: 7, texts: [
    'May Gray arrived on schedule, the coast is socked in and inland is blazing.',
    'Santa Ana blow, the canyon winds are loud at night, fire risk up.',
    'Rain in the forecast, the first real one in a long time, everyone checked twice.',
    'Marine layer burned off late, the morning commute was a cloud tunnel.',
    'Sunny and calm, the kind of January day the rest of the country hears about.',
    'High surf advisory, the pier is spray-covered and the cliffs are packed.',
    'Heat wave broke, breezy and 75, the whole town is at the beach.',
  ] },
  { name: 'Denver', posts: 8, texts: [
    'First snow of the season dusted the foothills, the mountain roads are a lesson.',
    'Chinook wind had the temperature jumping twenty degrees in an afternoon.',
    'Dry air, static shocks everywhere, the mountains glowing pink at dawn.',
    'Monsoon season, the sky after work turns into a science experiment.',
    'Hail core passed straight over, the baseball field looked like a slushie.',
    'Cold snap parked over the plains, the forecast is a wall of numbers.',
    'Bluebird day, no clouds, no wind, the sky is that aggressive Colorado blue.',
    'Rain on the dry ground, the whole city smells like sage.',
  ] },
  { name: 'Washington', posts: 7, texts: [
    'Fog off the Potomac, the bridges disappeared, the commute was a submarine movie.',
    'Pop-up storm flooded the metro underpasses, the usual suspects.',
    'Humidity is a personality trait this week, the air is warm soup.',
    'First frost on the monuments, tourists in shorts pretending not to shiver.',
    'Snowmageddon watch, the group chats are fully unhinged.',
    'Perfect fall day, the Mall is a sea of rakes and leaves.',
    'Derecho winds flattened the canopy along the river, the power flickered all night.',
  ] },
  { name: 'Minneapolis', posts: 7, texts: [
    'Wind chill warning, the lakes are steel gray, the ducks look concerned.',
    'First lake-effect snow band parked over town, the plows were out in force.',
    'Muggy start, the forecast says it is not done, storms building by evening.',
    'Ice fog forming on the parkways, the streetlights haloed in crystals.',
    'Indian summer at the lakes, paddleboards out in early October, unbelievable.',
    'Blizzard watch on the weekend, bread and milk sales are up.',
    'Dry cold, the air bites, the sky is a clean blue knife.',
  ] },
  { name: 'New Orleans', posts: 7, texts: [
    'Dew point is a number you whisper about, the air is a warm damp towel.',
    'Afternoon storms built over the lake, lightning on the horizon all evening.',
    'Sea breeze tried its best, the heat won.',
    'Rain on the tin roofs at 3 a.m., nature’s best playlist.',
    'Fog on the river, the ferries moved blind, the bridges vanished.',
    'Cold front pushed through, the maples on Esplanade are showing off.',
    'Hurricane season practice in the forecast, gas tanks full, water stocked.',
  ] },
  { name: 'Nashville', posts: 7, texts: [
    'Flash-flood watches on the creek roads, the river is high and hungry.',
    'Humid and green, the whole valley is a steam bath by noon.',
    'Fall colors peeking on the ridge roads, the weekend is golden.',
    'Cold front dropped the dew point like a stone, jacket weather overnight.',
    'Drought dust on the windshields, the sunsets are hazy and huge.',
    'Severe line crossed the river at rush hour, sirens and downed oaks.',
    'Frost on the baseball fields, the farmers market moved indoors.',
  ] },
  { name: 'Portland', posts: 7, texts: [
    'Nine days of drizzle, the sun is a rumor, mushrooms in the mulch.',
    'Rain finally broke, the sky cleared, the whole city stepped outside dazed.',
    'Windstorm blew branches across the bridges, the power blinked.',
    'Fog in the valley, the river was invisible from the banks.',
    'First snow dusting on the cone, the mountain is wearing its hat.',
    'Heat dome, the riverfront is the only place with a breeze.',
    'Blue skies for a week straight, the parks are a picnic blanket sea.',
  ] },
  { name: 'Kansas City', posts: 6, texts: [
    'Severe weather outlook for the weekend, everyone is watching the radar.',
    'Hail the size of quarters, the crops are bruised, the skies cleared.',
    'Hot and dry, the wind through the wheat is a dry hiss.',
    'Cold front slammed through, the temperature fell off a cliff.',
    'Fog on the river bottoms, the bridges rising out of the white.',
    'First snow of the season, the maple leaves and the flakes together, beautiful.',
  ] },
];

/** ~15 smaller towns, 2 text-only posts each (no snapshot). */
const SMALL = [
  { name: 'Marfa', texts: [
    'Wind all day on the flats, the mesquite humming, sky wide open and empty.',
    'Cold front came through, first time we have needed the fleece on the porch.',
  ] },
  { name: 'Eureka Springs', texts: [
    'Fog in the hollows at dawn, the Ozarks look like a watercolor.',
    'Rain washed the autumn leaves into the creek, the hills are gold and dripping.',
  ] },
  { name: 'Sitka', texts: [
    'Rain sideways, the island is a waterfall, the boat dock is a lake.',
    'Rare clear morning, Mount Edgecombe out in full white, the whole town looked up.',
  ] },
  { name: 'Bisbee', texts: [
    'Monsoon thunderheads stacked over the canyon, the rain came in sheets.',
    'Dry heat, the sky is a hard blue, the copper canyons smell like sage.',
  ] },
  { name: 'Taos', texts: [
    'Snow dusted the sagebrush flat, the mountains wore white by lunch.',
    'High desert wind, the light is doing that sharp Taos thing, shadows like cut paper.',
  ] },
  { name: 'Ely', texts: [
    'Cold snap on the high desert, the creek edges cracked with ice.',
    'Wind all day across the basin, the sky enormous and empty.',
  ] },
  { name: 'Port Townsend', texts: [
    'Fog horn in the strait, the town woke up white and quiet.',
    'Gale warning, the docks knock and groan, the seagulls grounded.',
  ] },
  { name: 'Galena', texts: [
    'First frost on the ridge, the apple trees look dusted with sugar.',
    'Leaf peaking on the hill roads, the forecast is sun and cool and perfect.',
  ] },
  { name: 'Bar Harbor', texts: [
    'Fog rolled off the sound, the island vanished, the ferries slowed down.',
    'Nor’easter building, the tide pools are churning, the air smells like salt and snow.',
  ] },
  { name: 'Moab', texts: [
    'Flash-flood watch, the slickrock will turn into gutters by evening.',
    'Blue-sky day, the desert air dry as paper, the canyon rim glowing.',
  ] },
  { name: 'Traverse City', texts: [
    'Lake-effect squall dumped snow on the orchards, the cherries are sleeping.',
    'Indian summer on the bay, the water is glass, the sailboats all out.',
  ] },
  { name: 'Sedona', texts: [
    'Monsoon storm broke over the red rocks, steam rising off the stone.',
    'Perfect morning, the canyons pink, not a cloud, the air smells like pine.',
  ] },
  { name: 'Juneau', texts: [
    'Rain again, the glacier rivers are running high, the town is a puddle.',
    'First snow on the Mendenoff, the ferry dock glittered, daylight barely eight hours.',
  ] },
  { name: 'Flagstaff', texts: [
    'First snow of the season on the pines, the ponderosas wore white hats.',
    'Dry and cold, the sky at altitude is a blue you cannot see from sea level.',
  ] },
  { name: 'Santa Fe', texts: [
    'Snow dusted the plaza, the high desert light turned everything silver.',
    'Aspen gold on the canyon roads, the wind carries woodsmoke from the coladeronas.',
  ] },
];

/** Friendly nickname pool — index-rotated, no real people. */
const NICKS = [
  'maple', 'junebug', 'prairie', 'sunny', 'river', 'dusty', 'willow', 'pepper',
  'cloudbase', 'fern', 'biscuit', 'pumpkin', 'hazel', 'wren', 'meadowlark',
  'coyote', 'cricket', 'juniper', 'poppy', 'otter', 'sandpiper', 'thistle',
];

// ------------------------------------------------------------------- seeding ---

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Math.max(1, Number(process.argv[i + 1]) || 0) : Infinity;
})();
/** Shard the plan: --offset N --count M seeds only plan[N .. N+M-1]. */
const OFFSET = (() => {
  const i = process.argv.indexOf('--offset');
  return i >= 0 ? Math.max(0, Number(process.argv[i + 1]) || 0) : 0;
})();
const COUNT = (() => {
  const i = process.argv.indexOf('--count');
  return i >= 0 ? Math.max(1, Number(process.argv[i + 1]) || 0) : Infinity;
})();
/** CI shard index: effective offset = shard * count (Actions expressions forbid math). */
const SHARD_OFFSET = (() => {
  const i = process.argv.indexOf('--shard');
  if (i < 0) return OFFSET;
  const shard = Math.max(0, Number(process.argv[i + 1]) || 0);
  const c = COUNT === Infinity ? 5 : COUNT;
  return OFFSET || shard * c;
})();
const DB_MODE = process.argv.includes('--db');
/** W3-D2 modes (see header): --reseed patches existing snapshots in place,
 *  --engagement seeds deterministic reactions/comments. Both shard cleanly
 *  with --shard/--count like the wave-2 CI fan-out. */
const RESEED_MODE = process.argv.includes('--reseed');
const ENGAGE_MODE = process.argv.includes('--engagement');

async function apiGet(path) {
  const res = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function apiPost(payload, session) {
  // 429 retry: the limiter is per-IP hourly; CI-sharded runners occasionally
  // share a NAT egress IP, so one patient retry (window slides) recovers.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/api/posts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nds-session': JSON.stringify(session),
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    if (res.status !== 429 || attempt === 2) throw new Error(`POST ${payload.town} -> ${res.status} ${JSON.stringify(body)}`);
    console.log(`  429 on ${payload.town}, retry in 65s (attempt ${attempt + 2}/3)`);
    await new Promise((r) => setTimeout(r, 65000));
  }
}

// ---- direct-DB mode (orchestrator; wave-1 L7 seed precedent) ----------------

/** FNV-1a content hash — identical to api/posts.js hashId (ids match). */
function hashId(prefix, ...parts) {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(36)}`;
}

function openPool() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('--db mode requires POSTGRES_URL (Neon production credential)');
  return import('pg').then(({ default: pg }) => new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } }));
}

/** Encode the live map canvas JPEG <=120 KB (src/lib/snapshot.ts pattern),
 *  then decode a 32x32 sample and report pixel variance + max channel delta
 *  (C7 freshness gate: a uniform black canvas has variance ~0). */
const SNAPSHOT_IN_PAGE = `(async () => {
  const nds = window.ndsMap;
  const canvas = nds && nds.getCanvas && nds.getCanvas();
  if (!canvas || !canvas.width) return { ok: false, error: 'map canvas not available' };
  const MAX_EDGE = 600, MAX_BYTES = 120 * 1024;
  const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h);
  let dataUrl = null, bytes = 0;
  for (const q of [0.8, 0.6, 0.45, 0.3]) {
    dataUrl = out.toDataURL('image/jpeg', q);
    bytes = Math.floor((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);
    if (bytes <= MAX_BYTES) break;
  }
  if (bytes > MAX_BYTES) return { ok: false, error: 'snapshot exceeds 120KB cap' };
  // Freshness check (C7): decode a small sample, measure spread. A canvas
  // captured before maplibre painted tiles is uniform (variance ~0, delta 0).
  let variance = -1, delta = -1;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode(); // drawImage on an undecoded image is a NO-OP (variance 0)
    const S = 32;
    const s = document.createElement('canvas');
    s.width = S; s.height = S;
    const sc = s.getContext('2d');
    sc.drawImage(img, 0, 0, S, S);
    const px = sc.getImageData(0, 0, S, S).data;
    let sum = 0, sum2 = 0, mn = 255, mx = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      sum += lum; sum2 += lum * lum;
      if (px[i] < mn) mn = px[i];
      if (px[i] > mx) mx = px[i];
    }
    const n = px.length / 4;
    const mean = sum / n;
    variance = sum2 / n - mean * mean;
    delta = mx - mn;
  } catch (e) { /* variance stays -1 -> treated as fresh-unknown, honest fail */ }
  return { ok: true, dataUrl, bytes, variance, delta };
})()`;

/** C7 freshness bar: real basemap imagery always exceeds this by orders of
 *  magnitude (uniform canvas = variance ~0). Fixed constant, deterministic. */
export const FRESH_MIN_VARIANCE = 16; // luminance variance (px^2)
export const FRESH_MIN_DELTA = 16; // max channel spread

/** True when a capture result is provably NOT a uniform (black) canvas. */
export function snapshotIsFresh(r) {
  return !!r && r.ok === true && r.variance >= FRESH_MIN_VARIANCE && r.delta >= FRESH_MIN_DELTA;
}

/** Drive the app: land on the town, persist the session, grab one snapshot.
 *  C7 FIX (the wave-2 black-image bug): the old flow captured right after
 *  isStyleLoaded + !isMoving — the GL canvas had style metadata but maplibre
 *  had not painted tiles yet (preserveDrawingBuffer reads the raw buffer).
 *  Now: style load -> jumpTo -> idle (tiles loaded + not moving) -> TWO
 *  requestAnimationFrame ticks (guaranteed paint frame) -> capture ->
 *  variance gate. On a uniform-canvas fail: back off, nudge zoom, repaint,
 *  recapture (honest retry, never ship black). */
async function visitTown(browser, town, session) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // One page per metro town; the context (and its chrome-headless renderer)
  // closes immediately after the snapshot so the fleet never stacks browsers.
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('  [page]', e.message));
  const slug = townSlug(town);
  await page.goto(`${BASE}/?ndsCenter=${town.lon},${town.lat}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ndsMap && window.ndsMap.isStyleLoaded(), null, { timeout: 60000 });
  await page.evaluate(([lon, lat]) => window.ndsMap.jumpTo({ center: [lon, lat], zoom: 10 }), [town.lon, town.lat]);
  await page.waitForFunction(() => window.ndsMap && !window.ndsMap.isMoving(), null, { timeout: 30000 });
  // S1 session seam: persist the same session the app uses.
  await page.evaluate((s) => localStorage.setItem('nds-session', JSON.stringify(s)), session);
  let snapshot = null;
  for (let attempt = 0; attempt < 3 && !snapshotIsFresh(snapshot); attempt++) {
    // Paint-frame gate (C7): style loaded + tiles loaded + not moving, then
    // two rAF ticks so the compositor has presented the painted frame.
    await page.waitForFunction(
      () => window.ndsMap && window.ndsMap.isStyleLoaded() && window.ndsMap.areTilesLoaded() && !window.ndsMap.isMoving(),
      null, { timeout: 30000 },
    );
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    snapshot = await page.evaluate(SNAPSHOT_IN_PAGE);
    if (!snapshotIsFresh(snapshot)) {
      console.log(`  [c7] ${slug}: canvas not painted (variance=${snapshot?.variance ?? 'n/a'}), repaint retry ${attempt + 2}/3`);
      // Nudge the camera (fixed offset, deterministic) to force a full repaint.
      await page.evaluate(([lon, lat]) => window.ndsMap.jumpTo({ center: [lon + 0.01, lat + 0.01], zoom: 10 }), [town.lon, town.lat]);
      await page.waitForFunction(() => window.ndsMap && !window.ndsMap.isMoving(), null, { timeout: 30000 });
    }
  }
  await ctx.close();
  if (!snapshotIsFresh(snapshot)) {
    console.error(`  [c7] ${slug}: capture FAILED freshness gate after retries — skipping snapshot (text-only post, honest)`);
    return null;
  }
  return snapshot;
}

// ---------------------------------------------------------------- W3-D2 modes ---

/** Deterministic engagement pattern (session 4 decision #1): post index i ->
 *  3 + i%6 reactions (3-8) + i%4 comments (0-3). Fixed pools, zero RNG. */
export function engagementTargets(i) {
  return { reactions: 3 + (i % 6), comments: i % 4 };
}
/** Reaction author nickname for (postIndex, reactionSlot) — fixed rotation. */
function reactionNick(i, j) {
  return NICKS[(i * 7 + j * 5) % NICKS.length];
}
/** Reaction emoji for (postIndex, reactionSlot) — cycles 👍 ❤️ 😂. */
function reactionEmoji(i, j) {
  return ['👍', '❤️', '😂'][(i + j) % 3];
}
/** Fixed reply strings — authored, index-rotated, no randomness. */
const COMMENT_POOL = [
  'Same here, the forecast has been lying to us all week.',
  'Watching the radar loop right now, it looks intense.',
  'Thanks for the heads up, driving home soon — stay safe out there.',
  'Wild. The sky over here looked exactly like this at sunset.',
  'My street did the same thing, water everywhere by 6pm.',
  'Checking on my neighbors, glad everyone is okay.',
  'This is why I keep an eye on the alerts app.',
  'Fog was so thick on the bridge this morning, crawling speed.',
  'Can confirm, felt it through the floor of the garage.',
  'The lake looks unreal in this light, wish I had a photo.',
  'Wind is not letting up, tied down the patio furniture.',
  'First one of the season, the plows were ready early.',
];

/** Flat engagement roster: every planned post with its global index. */
function engagementRoster() {
  const roster = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    roster.push({ index: i, town: p.town, townName: p.townName, text: p.text });
  }
  return roster;
}

async function apiAction(id, action, body, session) {
  // Real API in the exact ?path= form (C6 law). No rate limit applies to
  // reactions/comments (api/posts.js only bumps 'posts' + 'snapshot').
  const res = await fetch(`${BASE}/api/posts?path=${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nds-session': JSON.stringify(session),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${id}/${action} -> ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
  return res.json();
}

async function runEngagement(shard) {
  // Idempotent: GET current counts, top up to target ONLY (never toggle off
  // existing reactions — a re-run finds current>=target and skips).
  let addedR = 0, addedC = 0, postsTouched = 0;
  const failures = [];
  const byTown = new Map();
  for (const item of shard) {
    if (!byTown.has(item.town)) byTown.set(item.town, []);
    byTown.get(item.town).push(item);
  }
  for (const [town, items] of byTown) {
    let posts;
    try {
      ({ posts } = await apiGet(`/api/posts?town=${encodeURIComponent(town)}&sort=new`));
    } catch (err) {
      failures.push(`${town}: ${err.message}`);
      continue;
    }
    const byText = new Map(posts.map((p) => [p.text, p]));
    for (const item of items) {
      const post = byText.get(item.text);
      if (!post) continue; // not seeded (this town not seeded in this env)
      const { reactions: wantR, comments: wantC } = engagementTargets(item.index);
      const sess = { nickname: 'meadowlark', townSlug: town, townName: item.townName };
      const currentR = Object.values(post.reactions ?? {}).reduce((a, b) => a + b, 0);
      const currentC = post.commentsCount ?? 0;
      try {
        for (let j = currentR; j < wantR; j++) {
          await apiAction(post.id, 'reactions', { emoji: reactionEmoji(item.index, j) },
            { nickname: reactionNick(item.index, j), townSlug: town, townName: item.townName });
          addedR += 1;
        }
        for (let j = currentC; j < wantC; j++) {
          await apiAction(post.id, 'comments', { text: COMMENT_POOL[(item.index + j) % COMMENT_POOL.length] }, sess);
          addedC += 1;
        }
        postsTouched += 1;
        process.stdout.write('.');
      } catch (err) {
        failures.push(`${post.id}: ${err.message}`);
        process.stdout.write('x');
      }
    }
  }
  console.log(`\nengagement: +${addedR} reactions, +${addedC} comments across ${postsTouched} posts, failures ${failures.length}`);
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(failures.length ? 1 : 0);
}

async function runReseed(shardTowns) {
  // C7 re-seed: recapture one fresh snapshot per metro town (paint-fixed
  // visitTown) and PATCH every snapshot-bearing post in that town in place.
  // Owner decision: keep the 177 posts, replace the black canvases.
  const adminSecret = process.env.NDS_ADMIN_SECRET ?? '';
  const proof = []; // {town, patched, variance, delta, bytes}
  const failures = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  for (const { slug, townName } of shardTowns) {
    let posts;
    try {
      ({ posts } = await apiGet(`/api/posts?town=${encodeURIComponent(slug)}&sort=new`));
    } catch (err) {
      failures.push(`${slug}: list ${err.message}`);
      continue;
    }
    const snapPosts = posts.filter((p) => p.snapshot);
    if (!snapPosts.length) continue;
    const town = pickTown(townName);
    let snap = null;
    try {
      snap = await visitTown(browser, town, { nickname: 'maple', townSlug: slug, townName });
    } catch (err) {
      failures.push(`${slug}: capture ${err.message}`);
      continue;
    }
    if (!snap) { failures.push(`${slug}: capture failed freshness gate — posts left untouched (honest)`); continue; }
    let patched = 0;
    for (const post of snapPosts) {
      try {
        const res = await fetch(`${BASE}/api/posts?path=${encodeURIComponent(post.id)}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-nds-session': JSON.stringify({ nickname: 'maple', townSlug: slug, townName }),
            ...(adminSecret ? { 'x-nds-admin': adminSecret } : {}),
          },
          body: JSON.stringify({ snapshot: snap.dataUrl }),
        });
        if (!res.ok) throw new Error(`PATCH ${post.id} -> ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
        patched += 1;
      } catch (err) {
        failures.push(`${post.id}: ${err.message}`);
      }
    }
    proof.push({ town: slug, patched, variance: Math.round(snap.variance), delta: snap.delta, bytes: snap.bytes });
    console.log(`  ${slug}: patched ${patched}/${snapPosts.length} (variance=${Math.round(snap.variance)} delta=${snap.delta} bytes=${snap.bytes})`);
  }
  await browser.close();
  console.log(`\nreseed: ${proof.reduce((a, p) => a + p.patched, 0)} snapshots patched across ${proof.length} towns, failures ${failures.length}`);
  console.log('PROOF ' + JSON.stringify(proof));
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(failures.length ? 1 : 0);
}

// --------------------------------------------------------------------- main ---

const plan = [];
for (const m of METROS) {
  const town = pickTown(m.name);
  const slug = townSlug(town);
  const n = Math.min(m.posts, m.texts.length);
  for (let i = 0; i < n; i++) {
    plan.push({ town: slug, townName: town.name, text: m.texts[i % m.texts.length],
      nickname: NICKS[(plan.length + i) % NICKS.length], snapshot: true });
  }
}
for (const s of SMALL) {
  const town = pickTown(s.name);
  const slug = townSlug(town);
  for (let i = 0; i < s.texts.length; i++) {
    plan.push({ town: slug, townName: town.name, text: s.texts[i % s.texts.length],
      nickname: NICKS[(plan.length + i) % NICKS.length], snapshot: false });
  }
}

// --------------------------------------------------------------------- main ---

/** True when executed as a CLI (not imported by vitest). */
const IS_MAIN = (process.argv[1] ?? '').endsWith('seed-wave2.mjs');

async function main() {
  console.log(`W7 SEED plan: ${plan.length} posts across ${METROS.length + SMALL.length} towns (${METROS.length} metros, ${SMALL.length} small) — ${DRY ? 'DRY RUN' : DB_MODE ? 'LIVE (direct DB)' : RESEED_MODE ? 'LIVE (reseed, C7 paint-fix)' : ENGAGE_MODE ? 'LIVE (engagement seed, deterministic)' : `LIVE${LIMIT !== Infinity ? ` limit ${LIMIT}` : ''}${SHARD_OFFSET || COUNT !== Infinity ? ` shard ${SHARD_OFFSET}+${COUNT}` : ''}`}`);
  if (DRY) {
    for (const p of plan) console.log(`  ${p.town} [${p.nickname}] ${p.snapshot ? 'snap ' : 'text '} ${p.text}`);
    process.exit(0);
  }

  // ---- W3-D2 mode dispatch (runs on the full/sharded plan; no idempotency scan) ---
  if (ENGAGE_MODE) {
    const roster = engagementRoster().slice(SHARD_OFFSET, COUNT === Infinity ? undefined : SHARD_OFFSET + COUNT);
    await runEngagement(roster);
  }
  if (RESEED_MODE) {
    // One capture per metro town (snapshots only exist on metros). Shard by
    // town so CI runners stay under the 30-patch/hour/IP admin budget.
    const metroTowns = METROS.map((m) => ({ slug: townSlug(pickTown(m.name)), townName: m.name }));
    await runReseed(metroTowns.slice(SHARD_OFFSET, COUNT === Infinity ? undefined : SHARD_OFFSET + COUNT));
  }

  // Idempotency: GET existing posts per town; skip towns already seeded AND,
  // within a town, skip posts whose exact text already exists. Post-level skip
  // is what makes staggered/sharded runs (CI matrix, one runner per 5-post IP
  // budget) resume exactly where previous runs stopped, never duplicating text.
  const townsInPlan = [...new Map(plan.map((p) => [p.town, p])).values()];
  const existing = new Map(); // town -> Set(text)
  const pool = DB_MODE ? await openPool() : null;
  for (const p of townsInPlan) {
    let texts;
    if (DB_MODE) {
      const r = await pool.query(`select text from posts where town = $1`, [p.town]);
      texts = new Set(r.rows.map((x) => x.text));
    } else {
      const { posts } = await apiGet(`/api/posts?town=${encodeURIComponent(p.town)}&sort=new`);
      texts = new Set(posts.map((x) => x.text));
    }
    existing.set(p.town, texts);
    if (texts.size) console.log(`town ${p.town} has ${texts.size} posts (text-matching skip active)`);
  }
  console.log(`idempotency scan done: ${existing.size} towns checked`);

  let browser = null;
  if (plan.some((x) => x.snapshot && !existing.get(x.town)?.has(x.text))) {
    browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
  }

  let posted = 0;
  let snapOk = 0;
  const perTown = {};
  const failures = [];
  let snapshotTown = null;
  let currentSnapshot = null;
  const shard = plan.slice(SHARD_OFFSET, COUNT === Infinity ? undefined : SHARD_OFFSET + COUNT);
  outer: for (const post of shard) {
    if (posted >= LIMIT) break outer;
    if (existing.get(post.town)?.has(post.text)) continue; // already seeded
    if (post.snapshot && snapshotTown !== post.town) {
      // Fresh page per metro town: land on the map, persist session, capture.
      const town = pickTown(post.townName);
      try {
        snapshotTown = post.town;
        const sess = { nickname: post.nickname, townSlug: post.town, townName: post.townName };
        currentSnapshot = await visitTown(browser, town, sess);
        if (currentSnapshot) snapOk += 1;
      } catch (err) {
        console.error(`  snapshot visit failed for ${post.town}: ${err.message} (text-only fallback)`);
        currentSnapshot = null;
      }
    }
    const sess = { nickname: post.nickname, townSlug: post.town, townName: post.townName };
    try {
      if (DB_MODE) {
        // Process-edge clock (documented, scripts/seed.mjs precedent): ids
        // reproduce api/posts.js hashId(nickname, town, text, createdAt).
        const createdAt = new Date().toISOString();
        const id = hashId('p', post.nickname, post.town, post.text, createdAt);
        await pool.query(
          `insert into posts (id, town, author, text, snapshot, created_at)
           values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
          [id, post.town, post.nickname, post.text, currentSnapshot?.dataUrl ?? null, createdAt],
        );
      } else {
        const payload = { town: post.town, text: post.text };
        if (post.snapshot && currentSnapshot) payload.snapshot = currentSnapshot.dataUrl;
        await apiPost(payload, sess);
      }
      posted += 1;
      perTown[post.town] = (perTown[post.town] ?? 0) + 1;
      process.stdout.write('.');
    } catch (err) {
      failures.push(`${post.town}: ${err.message}`);
      process.stdout.write('x');
      if (/rate limited/.test(err.message)) break outer; // stagger: retry next hour
    }
  }
  if (browser) await browser.close();
  if (pool) await pool.end();

  console.log(`\nseeded ${posted} posts (${snapOk} towns with snapshots), failures ${failures.length}`);
  for (const [t, n] of Object.entries(perTown)) console.log(`  ${t}: ${n}`);
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(failures.length ? 1 : 0);

}

if (IS_MAIN) await main();
