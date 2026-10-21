# L3 DEPLOY-PIPELINE metrics — wave 1, run 2

Wall-clock counts ACTIVE RUNNING TIME ONLY (fleet gaps excluded).

| Metric | Value |
|---|---|
| Active time (lane) | ~13 min |
| Gate 0 syntax checks (node import) | PASS (preflight + migrate modules load) |
| Gate 0 vitest | PASS — 18/18 tests, 1 file |
| Preflight checks implemented | 4/4 (commit-author, function-count ≤12, env-audit, migrate-check) |
| Preflight live run (local, no vercel/POSTGRES_URL) | 3 PASS + 1 documented FAIL (no DB env) → NO-GO, correct gate behavior |
| Commits | 1 (`eea54c3`, author law email) |
| Files added | schema.sql, migrate.mjs, deploy-preflight.mjs, preflight.test.mjs, DEPLOY.md, metrics |
| Defects caught | package.json was base64-corrupted in scaffold (npm install broke) — decoded & fixed |
| Blockers | docs/lanes/WAVE-1-LANES.md absent from worktree (only BRIEF + DO-DONE present) — flagged to orchestrator |
| Deploy touched | NO (rules honored); api/probe.js untouched |
| api function count | 1 (probe.js) ≤ 12 |
| Schema tables | 5/5 idempotent CREATE IF NOT EXISTS |
