# WAVE-1 DEPLOY CHECKLIST (Gate 3) — nextdoor-skies run 2

**Deploy happens AFTER L8 goes green.** This checklist is the wave-1 deploy gate;
prepared by L10 close-out. Run from main tip. No deploy without every box checked.

## Preflight verification (done at close-out, 2026-10-20 22:10 CDT, main tip `467ee02`)

`node scripts/deploy-preflight.mjs` verified running and behaving per docs/DEPLOY.md:

| Check | Result | Notes |
|---|---|---|
| commit-author | ✅ PASS | 36 commits, all `clodge123@users.noreply.github.com` — author check passes on main |
| function-count | ✅ PASS | `api/*.js` count = **1** (probe.js) ≤ 12 (Hobby cap) |
| env-audit | ⚠️ skipped | vercel CLI absent locally — documented skip; **requires CI env** (`vercel env ls` + POSTGRES_URL secret) to produce a real PASS |
| migrate-check | ❌ FAIL (correct) | `POSTGRES_URL is not set` → NO-GO. Correct gate behavior; resolves once CI/prod env provides POSTGRES_URL |

Unit proof: `test/preflight.test.mjs` 18/18 pass.

## Deploy gate checklist

- [ ] **L8 GREEN** — integration CI green on main (tsc/eslint/build/vitest + scans + e2e). This is the deploy precondition.
- [ ] `node scripts/deploy-preflight.mjs` exits 0 in CI env (all 4 checks, incl. env-audit + migrate-check against Neon).
- [ ] Migrations applied: `POSTGRES_URL=... node db/migrate.mjs` then `--check` exits 0 (5 tables idempotent: reports, comments, flags, reactions, rate_limit).
- [ ] `vercel deploy --prod` from repo root (`vercel link` done; owner linked GitHub app manually).
- [ ] URLs recorded: preview `nextdoor-skies-git-<branch>-clodge123.vercel.app`, prod `nextdoor-skies.vercel.app`.
- [ ] Production smoke — Playwright against live URL: pages 200, renders, console clean, screenshots desktop/tablet/phone.
- [ ] HANDS-ON browser session (OpenClaw browser tool): human-style click-through, screenshots + notes. Mandatory.
- [ ] api/probe.js removed after smoke (wave-1 preflight evidence served its purpose).
- [ ] Smoke fix loop: any defect → fix → redeploy → re-smoke; max 3 loops, then escalate to owner.
- [ ] Ledger gaps closed by the Gate 2 CI run: `docs/screenshots/L5-map/` (R1/R2 zoom-tier shots) + theme screenshot (R12) archived into tree.

## Known env dependency

env-audit and migrate-check cannot PASS on this host (no vercel CLI, no
POSTGRES_URL). They run for real in CI with the Neon secret. A local NO-GO
with exactly these two failures is expected and is NOT a deploy blocker.

Full runbook: `docs/DEPLOY.md`.
