import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSeedData, seedOnce, TOWNS, VALID_TYPES, type ReportRow } from '../server/lib/seed.js';

const NOW = new Date('2026-10-20T18:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'seed-'));
  return join(dir, 'reports.json');
}

describe('buildSeedData', () => {
  const data = buildSeedData(NOW);

  it('produces ~30 posts across real towns', () => {
    expect(data.reports.length).toBe(30);
    expect(new Set(data.reports.map((r) => r.town))).toEqual(
      new Set(TOWNS.map((t) => `${t.name}, ${t.state}`)),
    );
  });

  it('rows are valid: real town coords, valid types, ts within 24h, seeded flag', () => {
    const byTown = new Map(TOWNS.map((t) => [`${t.name}, ${t.state}`, t]));
    const nowMs = NOW.getTime();
    for (const r of data.reports) {
      const town = byTown.get(r.town);
      expect(town, `town ${r.town} is a known real US town`).toBeDefined();
      expect(r.lat).toBeCloseTo(town!.lat, 6);
      expect(r.lon).toBeCloseTo(town!.lon, 6);
      expect(VALID_TYPES).toContain(r.type);
      const tsMs = Date.parse(r.ts);
      expect(tsMs).toBeGreaterThan(nowMs - DAY_MS);
      expect(tsMs).toBeLessThanOrEqual(nowMs);
      expect(r.seeded).toBe(true);
      expect(r.id).toMatch(/^seed-post-\d+$/);
    }
  });

  it('comments are one-level, 3-6 per post, ts between post ts and seed time', () => {
    const postById = new Map(data.reports.map((r) => [r.id, r]));
    const perPost = new Map<string, number>();
    const nowMs = NOW.getTime();
    for (const c of data.comments) {
      expect(c.seeded).toBe(true);
      const post = postById.get(c.report_id);
      expect(post, `comment ${c.id} attaches to an existing post`).toBeDefined();
      // one-level: a comment must never reference a comment id
      expect(c.id.startsWith('seed-comment-')).toBe(true);
      const cTs = Date.parse(c.ts);
      const pTs = Date.parse(post!.ts);
      expect(cTs).toBeGreaterThanOrEqual(pTs);
      expect(cTs).toBeLessThanOrEqual(nowMs);
      perPost.set(c.report_id, (perPost.get(c.report_id) ?? 0) + 1);
    }
    expect(perPost.size).toBe(data.reports.length);
    for (const n of perPost.values()) {
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('varied weather types across posts', () => {
    const types = new Set(data.reports.map((r) => r.type));
    expect(types.size).toBeGreaterThanOrEqual(4);
    for (const t of types) expect(VALID_TYPES).toContain(t);
  });

  it('is deterministic: same seed time -> byte-identical output', () => {
    expect(JSON.stringify(buildSeedData(NOW))).toEqual(JSON.stringify(data));
  });
});

describe('seedOnce via REPORTS_FILE (no prod Neon)', () => {
  it('seeds once, skips on re-run (idempotence)', async () => {
    const file = await tmpFile();
    const first = await seedOnce({ reportsFile: file, now: NOW });
    expect(first.seeded).toBe(true);
    expect(first.posts).toBe(30);

    const afterFirst = JSON.parse(await readFile(file, 'utf8'));
    expect(afterFirst.reports.length).toBe(30);
    expect(afterFirst.comments.length).toBe(first.comments);

    const second = await seedOnce({ reportsFile: file, now: NOW });
    expect(second.seeded).toBe(false);
    expect(second.reason).toMatch(/not empty/);

    const afterSecond = JSON.parse(await readFile(file, 'utf8'));
    expect(JSON.stringify(afterSecond)).toEqual(JSON.stringify(afterFirst));

    const third = await seedOnce({ reportsFile: file, now: NOW });
    expect(third.seeded).toBe(false);
    expect(JSON.parse(await readFile(file, 'utf8')).reports.length).toBe(30);

    await rm(file, { force: true });
  });

  it('does not seed when the store already has rows', async () => {
    const file = await tmpFile();
    const existing: ReportRow[] = [
      {
        id: 'real-1',
        town: 'Marfa, TX',
        lat: 30.3097,
        lon: -104.0199,
        type: 'clear',
        body: 'real user post',
        author: 'someone',
        ts: NOW.toISOString(),
        seeded: false,
      },
    ];
    await writeFile(file, JSON.stringify({ version: 1, reports: existing, comments: [] }), 'utf8');
    const result = await seedOnce({ reportsFile: file, now: NOW });
    expect(result.seeded).toBe(false);
    expect(result.posts).toBe(1);
    const store = JSON.parse(await readFile(file, 'utf8'));
    expect(store.reports.length).toBe(1);
    expect(store.reports[0].id).toBe('real-1');
    await rm(file, { force: true });
  });

  it('throws without POSTGRES_URL or REPORTS_FILE', async () => {
    await expect(seedOnce({})).rejects.toThrow(/POSTGRES_URL|REPORTS_FILE/);
  });
});
