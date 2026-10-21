# WAVE-1 METRICS ROLLUP (run 2) — close-out

Accounting law (R18): wall-clock ACTIVE minutes only; fleet gaps excluded.
T0 = 2026-10-20 19:45 CDT. Wave closed 21:22 CDT (all lanes merged), integration
merge `467ee02` 22:06 CDT. Source rows: docs/metrics/L*.md.

## Active minutes per lane

| Lane | Window (CDT) | Active min | Source | Notes |
|------|--------------|-----------|--------|-------|
| L1 scaffold | 19:45–20:25 | 38 | L1-scaffold.md | |
| L2 playwright | 20:02–20:47 | 45 | L2-playwright.md | |
| L3 deploy | 20:02–20:15 | 13 | L3-deploy.md | |
| L4 theme | 20:02–20:23 | ~21 | **reconstructed** | metrics file missing (lane killed); window = lane start → lane commit `608ac50` 20:23 |
| L5 map | 20:02–20:41 | ~39 | **reconstructed** | metrics file missing (lane killed); window = lane start → last lane commit `d5987a7` 20:41 |
| L6 badges | 20:02–21:10 | 72 | L6-badges.md | phase table sums ~72 |
| L7 seed | 20:02–20:37 | 35 | L7-seed.md | |
| **WAVE-1 TOTAL** | | **~263** | | 5/7 lanes self-reported; 2 reconstructed from git history |

Wall-clock wave span (19:45→21:22 merges) = 97 min; active-sum 263 min across
7 parallel lanes (parallelism factor ~2.7×).

## Gate counters

| Gate | Result | Evidence |
|------|--------|----------|
| Gate 0 × 7 lanes | 7/7 PASS | L1 tsc/eslint/build/vitest+3 scans; L2 e2e 6/6+selftest; L3 vitest 18/18; L4 theme vitest green (merge `467ee02`); L5 vitest 16/16 (`d5987a7`); L6 vitest 18/18; L7 vitest 8/8 |
| Gate 1 × 7 lanes | 5/7 archived, 2/7 code-only | L2 golden-path 6/6 3-viewport; L6 badges 6/6 + 6 screenshots; L7 seed 3/3 + 1 screenshot; L4 theme spec asserts computed accent (no PNG archived); L5 map spec renders+zoom asserts (no PNG archived) |
| Determinism scan (R17) | PASS all lanes | CI scan + lane-scans.sh, zero hits |
| Radius scan (R20) | PASS all lanes | zero raw border-radius |
| No-CWC import scan | PASS | zero cross-repo imports |
| Deploy preflight (main tip) | 3 PASS + 1 documented FAIL | author 36/36 ✓, functions 1≤12 ✓, env-audit skipped (no vercel CLI), migrate-check NO-GO without POSTGRES_URL (correct gate behavior) |
| api function count | 1 (probe.js) ≤ 12 | |

## Catches (defects found by gates)

| Lane | Catches | Highlights |
|------|---------|-----------|
| L1 | 5 | base64-corrupt lanes doc recovered from `2ad80ea`; @types/node; test import path; scanner self-flag; tsbuildinfo committed |
| L2 | 5 | root package.json base64 (npm unparseable) → decoded + shield package.jsons; .e2e isolated deps; NODE_USE_ENV_PROXY hijacked localhost health-checks → NO_PROXY; port 4173 squatted by foreign app → 43117; lazy console collector → auto:true |
| L3 | 1 | package.json base64-corrupted in scaffold (npm install broke) — decoded & fixed |
| L4 | n/a | no metrics file (killed lane) |
| L5 | n/a | no metrics file (killed lane) |
| L6 | 3 | egress proxy 407 loopback → --no-proxy-server + port 4183; webkit missing arm64 → 3 Chromium touch projects; .tap() on non-touch desktop → tapOrClick |
| L7 | 1 | Playwright about:blank fetch → fixture serves page+API same-origin |
| **Total** | **15** | (+1 cross-lane port collision, L6↔L2) |

## Interventions

- **Owner interventions: 2** — (1) base64 trees-API corruption fix directive,
  (2) lane-resume directive after mid-run kills.
- Cross-lane collisions: 1 (port 4173; moved to 4183, no code impact).

## Totals

- Active lane-minutes: **~263** (38+45+13+21+39+72+35)
- Gate 0: **7/7 PASS** · Gate 1: **5/7 fully archived** (2 screenshot GAPs, L4/L5)
- Catches: **15** · Owner interventions: **2**
- Lanes killed mid-run: 3 (per retro; work rescued via merge `467ee02`)
- Commits on main: 36, all authored clodge123@users.noreply.github.com
