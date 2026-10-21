# SEED-CONTRACT — L7 Seed-Demo-Infra (R14)

## Purpose

The app must never be empty (R14). On a fresh store, `seedOnce` inserts ~30 demo
posts spread across 30 real US towns, each with 3–6 one-level comments, all
flagged so the UI can label them honestly (R19: real data or explicit demo —
never lookalike fallbacks).

## The contract

1. **Seed-once.** Seeding runs only when the reports table/file is EMPTY.
   A non-empty store is left untouched; the runner reports
   `not seeded (reports table/file not empty — seed-once, skipping)`.
2. **Seeded flag.** Every seeded row (posts AND comments) carries
   `seeded: true`. Real user rows carry `seeded: false` (column default).
3. **UI labeling.** The feed renders a visible **"Demo data"** badge on every
   row where `seeded === true`. This badge is mandatory UI copy — the wave-2
   feed must keep it (fixture: `tests/fixtures/feed-page.ts`, proof:
   `tests/seed.spec.ts`).
4. **Idempotent writes.** `INSERT ... ON CONFLICT (id) DO NOTHING` with
   deterministic ids (`seed-post-<n>`, `seed-comment-<post>-<n>`), so double
   runs can never duplicate rows.
5. **Row shape.** 30 posts, one per town in `TOWNS` (real US towns with real
   coordinates, e.g. Marfa TX 30.3097,-104.0199). Weather types are one of
   `rain | storm | snow | clear | heat`, ~75% matching the town's climate zone
   for plausibility. Every `ts` is within 24h before the seed time. Comments
   attach to posts only (one level, R8) with `ts` between post ts and seed time.

## Backends

| Backend | Trigger | Notes |
|---|---|---|
| Postgres (Neon) | `POSTGRES_URL` env | Applies `server/migrations/001_reports.sql` (CREATE TABLE IF NOT EXISTS) then seeds. Production path. |
| JSON file | `REPORTS_FILE` env | Same seed-once semantics over `{version,reports,comments}` JSON. Tests/dev only — never points at prod Neon. |

If both are set, Postgres wins. `scripts/seed.mjs` reads env vars and exits 0
in both seeded and already-seeded cases.

## Determinism (R17)

- `server/lib/seed.ts` contains no `Math.random`, `Date.now`, or `new Date()`
  (the static scan proves it). The seed simulation uses mulberry32 with the
  fixed constant `0x5eed1234`; the seed time arrives as a `now` parameter.
- The CLI (`scripts/seed.mjs`) passes `new Date()` at the process edge — that
  is the seed *run* time, not render/logic-path clock use.
- Same `now` ⇒ byte-identical dataset (asserted in `tests/seed.test.ts`).

## Running

```bash
npm run build && npm run seed                    # POSTGRES_URL required
REPORTS_FILE=./tmp/reports.json node scripts/seed.mjs   # file mode
```
