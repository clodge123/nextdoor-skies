# DEPLOY Runbook — nextdoor-skies (run 2)

Deploy pipeline for wave-1 production deploys (R16). **No deploy happens without
preflight GO.** Deploys are CLI-driven (`vercel`), owner links the GitHub app manually.

## Author law

Every commit must be authored by `clodge123 <clodge123@users.noreply.github.com>`
(verified working credential). Set per repo:

```bash
git config user.name clodge123
git config user.email clodge123@users.noreply.github.com
```

The preflight gate reads `git log --format=%ae` and fails on any other email.

## Step 1 — Preflight (gate, exit 0 required)

```bash
node scripts/deploy-preflight.mjs          # human output
node scripts/deploy-preflight.mjs --json   # CI consumption
```

Four checks, all must pass:

| Check | Rule | Failure meaning |
|---|---|---|
| `commit-author` | all commit author emails = `clodge123@users.noreply.github.com` | fix with `git rebase` author rewrite |
| `function-count` | `api/**/*.js` count ≤ 12 | Hobby cap; merge/split functions into non-api modules |
| `env-audit` | `POSTGRES_URL` present when `vercel env ls` is available | `vercel env add POSTGRES_URL production` (Neon credential) |
| `migrate-check` | `node db/migrate.mjs --check` exits 0 | run `node db/migrate.mjs` against `POSTGRES_URL` |

`vercel` CLI absent (local dev) ⇒ env-audit is a documented skip, not a pass-fail.

## Step 2 — Migration (auto-migration in deploy lifecycle)

Schema is idempotent (`CREATE TABLE IF NOT EXISTS`), so apply-before-deploy is always safe:

```bash
POSTGRES_URL=postgres://... node db/migrate.mjs          # apply + verify
POSTGRES_URL=postgres://... node db/migrate.mjs --check  # verify only (what preflight runs)
```

Tables: `reports`, `comments` (FK→reports, cascade delete), `flags`, `reactions`
(unique per author/report/emoji), `rate_limit` (unique per author/bucket).
Migration failure aborts deploy — never deploy code that expects missing tables.

## Step 3 — Deploy

```bash
vercel deploy --prod        # from repo root; requires `vercel link` done once
```

Record both URLs:
- preview: `https://nextdoor-skies-git-<branch>-clodge123.vercel.app` (auto per push)
- production: `https://nextdoor-skies.vercel.app`

## Step 4 — Smoke (post-deploy, real browser)

1. `GET /api/probe.js` → expect `{"ok":true,"db":"<database>"}` (confirms POSTGRES_URL + DB reachable).
2. Homepage loads map, zero console errors.
3. Post a report → appears in feed; comment + react round-trip.
4. If anything fails: SMOKE FIX LOOP — fix → redeploy → re-smoke (max 3 loops, then escalate to owner).

## Env var audit checklist

- `POSTGRES_URL` — Neon production credential, encrypted, set via `vercel env add`.
- No secrets committed (`.env*` gitignored). Never paste connection strings into chat/commits.

## Rollback

```bash
vercel ls && vercel rollback <deployment-id>
```

Schema changes are additive-only in wave 1 (IF NOT EXISTS), so DB rollback is not required for code rollback.
