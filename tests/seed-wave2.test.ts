// W3-D2 SEEDER GATE (vitest, node env): the deterministic engagement pattern
// (session 4 decision #1) and the C7 snapshot-freshness gate must be exact.
// Imports the seeder module — IS_MAIN guard keeps the import side-effect-free
// (no live API calls, no browser launch).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  engagementTargets,
  snapshotIsFresh,
  FRESH_MIN_VARIANCE,
  FRESH_MIN_DELTA,
} from '../scripts/seed-wave2.mjs';

describe('engagement pattern (deterministic, session 4)', () => {
  it('reactions land in 3-8 and comments in 0-3 for the first 200 indices', () => {
    for (let i = 0; i < 200; i++) {
      const { reactions, comments } = engagementTargets(i);
      expect(reactions).toBeGreaterThanOrEqual(3);
      expect(reactions).toBeLessThanOrEqual(8);
      expect(comments).toBeGreaterThanOrEqual(0);
      expect(comments).toBeLessThanOrEqual(3);
    }
  });

  it('pattern is a fixed function of index (no randomness)', () => {
    // Same index -> same targets, always; cycles are exact.
    expect(engagementTargets(0)).toEqual({ reactions: 3, comments: 0 });
    expect(engagementTargets(0)).toEqual(engagementTargets(0));
    expect(engagementTargets(6)).toEqual({ reactions: 3, comments: 2 });
    expect(engagementTargets(11)).toEqual({ reactions: 8, comments: 3 });
    // every post gets >=3 reactions: nothing is hot-score-dead at seed time
    for (let i = 0; i < 177; i++) expect(engagementTargets(i).reactions).toBeGreaterThan(0);
  });

  it('seeder script contains zero Math.random / Date.now / new Date outside documented edges', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/seed-wave2.mjs'), 'utf8');
    const lines = src.split('\n');
    const hits = [];
    lines.forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return; // doc comments name the law
      if (/Math\.random|\bDate\.now\b/.test(line)) hits.push(`${i + 1}: ${line.trim()}`);
      if (/\bnew Date\b/.test(line) && !/createdAt/.test(line)) hits.push(`${i + 1}: ${line.trim()}`);
    });
    // The only sanctioned clock use: DB_MODE insert (documented process-edge).
    expect(hits).toEqual([]);
  });
});

describe('snapshot freshness gate (C7)', () => {
  it('rejects a uniform black canvas (variance/delta ~0)', () => {
    expect(snapshotIsFresh({ ok: true, dataUrl: 'x', bytes: 50491, variance: 0, delta: 0 })).toBe(false);
    expect(snapshotIsFresh({ ok: true, dataUrl: 'x', bytes: 50491, variance: 0.4, delta: 1 })).toBe(false);
    expect(snapshotIsFresh({ ok: true, dataUrl: 'x', variance: -1, delta: -1 })).toBe(false);
    expect(snapshotIsFresh(null)).toBe(false);
    expect(snapshotIsFresh({ ok: false, error: 'no canvas' })).toBe(false);
  });

  it('accepts a real painted basemap frame (variance far above the bar)', () => {
    expect(snapshotIsFresh({ ok: true, dataUrl: 'x', bytes: 65751, variance: 3200, delta: 210 })).toBe(true);
    expect(snapshotIsFresh({ ok: true, dataUrl: 'x', bytes: 34267, variance: FRESH_MIN_VARIANCE, delta: FRESH_MIN_DELTA })).toBe(true);
  });

  it('the bar sits orders of magnitude above a uniform canvas', () => {
    expect(FRESH_MIN_VARIANCE).toBeGreaterThanOrEqual(16);
    expect(FRESH_MIN_DELTA).toBeGreaterThanOrEqual(16);
  });
});

// ---------------------------------------------------------------------------
// W3-E1 POLISH SEEDS (brainstorm session 5): the polish roster + engagement
// top-up must be deterministic, hot-visible, and story-coherent.
// ---------------------------------------------------------------------------
import { plan, polishPlan, engagementTargetsFor } from '../scripts/seed-wave2.mjs';
import { HOT_SCORE_MIN } from '../api/posts.js';

describe('polish roster (W3-E1, session 5)', () => {
  const DEMO_TOWNS = [
    'springfield-37.22--93.3', 'salina-38.84--97.61', 'amarillo-35.22--101.83',
    'flagstaff-35.2--111.65', 'santa-fe-35.69--105.94',
  ];

  it('adds exactly 20 polish posts across the 5 demo towns, 4 each', () => {
    const pp = polishPlan();
    expect(pp).toHaveLength(20);
    const byTown = new Map<string, typeof pp>();
    for (const p of pp) {
      if (!byTown.has(p.town)) byTown.set(p.town, []);
      byTown.get(p.town)!.push(p);
    }
    expect([...byTown.keys()].sort()).toEqual([...DEMO_TOWNS].sort());
    for (const [town, posts] of byTown) {
      expect(posts, town).toHaveLength(4);
      expect(posts.filter((p) => p.snapshot), town).toHaveLength(1); // >=1 map snapshot
      expect(posts[0].snapshot, town).toBe(true); // the FIRST post carries it
    }
  });

  it('plan is index-stable: wave-2 keeps its 177 indices, polish appends', () => {
    expect(plan).toHaveLength(197);
    expect(plan.slice(0, 177)).toHaveLength(177);
    // The 177 wave-2 posts are untouched (engagement pattern preserved).
    expect(plan.slice(177).every((p) => p.polish === true)).toBe(true);
    expect(polishPlan()).toHaveLength(20);
  });

  it('every polish post is hot at seed time (score >= HOT_SCORE_MIN)', () => {
    // Hot score: comments*2 + reactions + exp(-age/12) >= 3. Polish pattern
    // guarantees >=3 reactions + >=1 comment => score >= 5, decay-free floor.
    for (const p of polishPlan()) {
      const { reactions, comments } = engagementTargetsFor({ index: plan.indexOf(p), polish: true });
      expect(comments).toBeGreaterThanOrEqual(1);
      expect(comments).toBeLessThanOrEqual(3); // session-4 law subset
      expect(reactions).toBeGreaterThanOrEqual(3);
      expect(reactions).toBeLessThanOrEqual(8);
      expect(comments * 2 + reactions).toBeGreaterThanOrEqual(HOT_SCORE_MIN);
    }
  });

  it('engagementTargetsFor is exact: base pattern unchanged, polish floors at 1 comment', () => {
    for (let i = 0; i < 177; i++) {
      expect(engagementTargetsFor({ index: i, polish: false })).toEqual(engagementTargets(i));
    }
    // Polish: reactions ride the base pattern, comments = 1 + i%3.
    expect(engagementTargetsFor({ index: 177, polish: true })).toEqual({ reactions: 6, comments: 1 });
    expect(engagementTargetsFor({ index: 178, polish: true })).toEqual({ reactions: 7, comments: 2 });
    expect(engagementTargetsFor({ index: 179, polish: true })).toEqual({ reactions: 8, comments: 3 });
    expect(engagementTargetsFor({ index: 180, polish: true })).toEqual({ reactions: 3, comments: 1 });
  });

  it('weather narrative: every demo town references real phenomena (storm/heat/snow/fog)', () => {
    const themes = /storm|chase|tornado|hail|heat|monsoon|snow|ice|frost|fog|haboob|lake-effect|cold front|wind/i;
    const byTown = new Map<string, string[]>();
    for (const p of polishPlan()) {
      if (!byTown.has(p.town)) byTown.set(p.town, []);
      byTown.get(p.town)!.push(p.text);
    }
    for (const [town, texts] of byTown) {
      expect(texts.filter((t) => themes.test(t)).length, town).toBeGreaterThanOrEqual(3);
    }
  });

  it('polish-seeds.mjs (local harness polisher) is determinism-clean (R17)', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/polish-seeds.mjs'), 'utf8');
    const hits = [];
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;
      if (/Math\.random|\bDate\.now\b|\bnew Date\b/.test(line)) hits.push(`${i + 1}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
