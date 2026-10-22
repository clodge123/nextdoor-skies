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
