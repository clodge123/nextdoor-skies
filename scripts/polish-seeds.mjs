#!/usr/bin/env node
/**
 * W3-E1 POLISH SEEDS — seed the REAL_API local harness (scripts/api-serve.mjs)
 * with the FULL polished plan: the wave-2 roster (177 posts) + the W3-E1
 * polish roster (5 demo towns x 4 posts, storm chases / heat waves / snow /
 * fog narrative), then top up engagement per the fixed pattern (3-8
 * reactions + 0-3 comments; polish posts >=1 comment). This is the "seeded
 * db snapshot" the gated seed spec asserts against: polished posts with
 * non-black snapshots + visible engagement in the Hot view.
 *
 * NO prod writes (deploy law: prod runs wave-2 code until wave-end). Prod
 * post-deploy runs the SAME plan through scripts/seed-wave2.mjs (CI matrix +
 * --db direct-insert mode + --engagement), which now carries the polish
 * roster in its plan — see docs/DEMO-SCRIPT.md "what to run post-deploy".
 *
 * Determinism (R17): zero Math.random / Date.now / new Date. Ids +
 * timestamps arrive from the server (api/posts.js hashId + now()). Text is
 * authored (imported straight from the seeder module). Snapshots use the
 * committed deterministic basemap fixture (tests/fixtures/polish-map.jpg) —
 * real JPEG bytes, real pixel variance; the live map capture path belongs to
 * the CI seeder, not this node-only harness.
 *
 * Idempotent: GETs each town first and skips posts whose exact text already
 * exists (same text-matching law as seed-wave2.mjs); engagement tops up to
 * target only, never toggles existing reactions off. Safe to re-run.
 *
 * Usage:
 *   node scripts/api-serve.mjs 43118 &
 *   node scripts/polish-seeds.mjs                       # seed the harness
 *   SEED_BASE_URL=http://127.0.0.1:43118 node scripts/polish-seeds.mjs
 *   node scripts/polish-seeds.mjs --dry                 # plan only
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engagementRosterFor, plan, polishPlan, reactionNick } from './seed-wave2.mjs';

const BASE = (process.env.SEED_BASE_URL ?? 'http://127.0.0.1:43118').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry');
const here = dirname(fileURLToPath(import.meta.url));

/** Fixed reply strings — same authored pool as seed-wave2 --engagement. */
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

/** Committed deterministic basemap frame (map-like, non-uniform JPEG). */
const SNAPSHOT_DATA_URL = 'data:image/jpeg;base64,'
  + readFileSync(resolve(here, '../tests/fixtures/polish-map.jpg')).toString('base64');

async function apiGet(path) {
  const res = await fetch(BASE + path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function apiPost(payload, session) {
  const res = await fetch(`${BASE}/api/posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nds-session': JSON.stringify(session) },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${payload.town} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function apiAction(id, action, body, session) {
  const res = await fetch(`${BASE}/api/posts?path=${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nds-session': JSON.stringify(session) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${id}/${action} -> ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);
  return res.json();
}

// --------------------------------------------------------------------- main ---

if (DRY) {
  console.log(`polish-seeds DRY: ${plan.length} posts (${polishPlan().length} polish), harness ${BASE}`);
  for (const p of polishPlan()) console.log(`  ${p.town} [${p.nickname}] ${p.snapshot ? 'snap ' : 'text '} ${p.text}`);
  process.exit(0);
}

// 1. Posts: text-matching skip (idempotent). Snapshots ride the fixture.
const byTown = new Map();
for (const p of plan) {
  if (!byTown.has(p.town)) byTown.set(p.town, []);
  byTown.get(p.town).push(p);
}
let posted = 0, snapPosted = 0, skipped = 0;
const failures = [];
for (const [town, posts] of byTown) {
  let existing = new Set();
  try {
    const { posts: rows } = await apiGet(`/api/posts?town=${encodeURIComponent(town)}&sort=new`);
    existing = new Set(rows.map((x) => x.text));
  } catch (err) {
    failures.push(`${town}: list ${err.message}`);
    continue;
  }
  for (const p of posts) {
    if (existing.has(p.text)) { skipped += 1; continue; }
    const sess = { nickname: p.nickname, townSlug: p.town, townName: p.townName };
    try {
      const payload = { town: p.town, text: p.text };
      if (p.snapshot) payload.snapshot = SNAPSHOT_DATA_URL;
      await apiPost(payload, sess);
      posted += 1;
      if (p.snapshot) snapPosted += 1;
      process.stdout.write('.');
    } catch (err) {
      failures.push(`${p.town}: ${err.message}`);
      process.stdout.write('x');
    }
  }
}

// 2. Engagement: top up to the fixed pattern (idempotent, same law as
//    seed-wave2 --engagement; polish posts guarantee >=1 comment).
let addedR = 0, addedC = 0;
for (const item of engagementRosterFor(plan)) {
  let rows;
  try {
    ({ posts: rows } = await apiGet(`/api/posts?town=${encodeURIComponent(item.town)}&sort=new`));
  } catch (err) {
    failures.push(`${item.town}: engage list ${err.message}`);
    continue;
  }
  const post = rows.find((p) => p.text === item.text);
  if (!post) continue;
  const sess = { nickname: 'meadowlark', townSlug: item.town, townName: item.townName };
  const currentR = Object.values(post.reactions ?? {}).reduce((a, b) => a + b, 0);
  const currentC = post.commentsCount ?? 0;
  const { reactions: wantR, comments: wantC } = item.targets;
  try {
    for (let j = currentR; j < wantR; j++) {
      // Unique rotating nickname per reaction slot (same roster as the CI
      // seeder): reactions key on (post, nickname), so reusing one nickname
      // would TOGGLE the previous reaction off instead of adding.
      await apiAction(post.id, 'reactions',
        { emoji: ['👍', '❤️', '😂'][(item.index + j) % 3] },
        { nickname: reactionNick(item.index, j), townSlug: item.town, townName: item.townName });
      addedR += 1;
    }
    for (let j = currentC; j < wantC; j++) {
      await apiAction(post.id, 'comments',
        { text: COMMENT_POOL[(item.index + j) % COMMENT_POOL.length] }, sess);
      addedC += 1;
    }
  } catch (err) {
    failures.push(`${post.id}: engage ${err.message}`);
  }
}

console.log(`\npolish-seeds: ${posted} posts (${snapPosted} snapshots), ${skipped} skipped (text-match), +${addedR} reactions, +${addedC} comments, failures ${failures.length}`);
for (const f of failures) console.error(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
