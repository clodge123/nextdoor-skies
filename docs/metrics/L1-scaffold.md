# L1 SCAFFOLD — metrics (run 2, wave 1)

T0 = 2026-10-20 19:45 CDT. Active minutes only (wall-clock gaps excluded).

| Lane | Start (CDT) | End (CDT) | Active min | Gate0 | Catches |
|------|-------------|-----------|------------|-------|---------|
| L1   | 2026-10-20 19:45 | 2026-10-20 20:25 | 38 | PASS (tsc/eslint/build/vitest + 3 scans) | 3 |

## Gate 0 results (2026-10-20 20:24 CDT)

- tsc -b: exit 0
- eslint .: exit 0
- vite build: exit 0 (261 kB bundle)
- vitest run: 3/3 tests pass (App shell component test, jsdom)
- determinism scan (R17): OK — 5 source files, zero Math.random/Date.now/new Date
- radius scan (R20): OK — 7 files, zero raw border-radius (var(--radius) only)
- no-CWC import scan: OK — 15 files scanned
- prettier --check: clean

## Catches

1. `docs/lanes/WAVE-1-LANES.md` not present in the worktree tree — recovered from
   commit `2ad80ea` (on `main`, not merged into lane branch). Lane brief read from there.
2. `tsc -b` failed TS2688 "Cannot find type definition file for 'node'" — fixed by
   adding `@types/node` devDependency.
3. Test file imported `../App` (outside src include path) — fixed to `./App`.
4. CWC scanner flagged its own source (the pattern string it forbids) — scanner
   now skips itself.
5. `tsconfig.*.tsbuildinfo` artifacts got committed in survival commit — added to
   `.gitignore` and untracked.

## Notes

- Worktree: ~/.openclaw/worktrees/r2/w1-L1, branch `r2w1/L1-scaffold`.
- No git remote configured on the shared repo; push path = orchestrator (lane doc
  says GitHub API contents/trees/refs; git transport proxy-blocked).
- Ownership respected: src/index.css + src/lib/theme.ts untouched (L4); MapView untouched (L5);
  no Playwright config (L2). main.tsx carries a documented seam comment for L4's
  `import './index.css'`.
- Files added: index.html, src/{main,App,App.test}.tsx, src/components/Header.tsx,
  src/pages/{MapPage,FeedPage}.tsx, src/test/setup.ts, tsconfig{,.app,.node,.test}.json,
  vite.config.ts, vitest.config.ts, eslint.config.js, .prettierrc.json,
  .prettierignore, scripts/check-{determinism,radius,no-cwc}.mjs,
  .github/workflows/ci.yml, docs/metrics/L1-scaffold.md.
