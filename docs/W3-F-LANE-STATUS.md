# W3-F — QA Harness (wave 3, round 3)

Branch `r3w3/F-qa`. Scope (brainstorm session 5 law): click-every-button
pass + production-shaped smoke, NO mocked-route shortcuts.

## Delivered

1. **scripts/qa-harness.mjs** — click-every-button sweep across
   `/`, `/feed`, `/t/<slug>`, `/t/<slug>/feed`, `/p/<id>`, `/alerts`
   against the REAL_API=1 harness (`scripts/api-serve.mjs`: built dist +
   actual `api/*.js` handlers, SPA rewrite mirrors `vercel.json`; zero
   `page.route` mocks — C6 law). Enumerates `a[href]`, `button`, `input`,
   `textarea`, `select`, `[role=button]`, `[contenteditable]`; clicks each
   (dedupe by identity, Escape between clicks, navigate back on route
   change); asserts zero app console errors / zero `/api` responses ≥400 /
   zero pageerrors; prints per-route PASS/FAIL table (failures=0 semantics;
   `PASS(no-targets)` flags enumeration gaps).
2. **scripts/e2e-gate.sh QA=1 mode** — opt-in (default off, existing
   behavior byte-identical): `QA=1 scripts/e2e-gate.sh` (no command) runs
   the sweep inside the browser gate. Canonical CI form:
   `QA=1 REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/qa.spec.ts`.
3. **tests/qa.spec.ts** — same pass as Playwright tests for CI, same
   production-shaped server, gated on REAL_API=1, all three viewports.
4. **A11y keyboard spot pass** (inside qa.spec.ts): Tab order reaches
   header controls + main content per route; Enter activates (nav link
   navigates; phone: hamburger→drawer→Map link; map zoom buttons fire on
   Enter); Ctrl+K/Escape leaves focus on a real control — no traps.
5. **docs/QA-REPORT.md** — latest-run template (routes, clicks, failures=0
   semantics, exclusions, deviations).

## Harness bug found BY the harness (the point of it)

`api-serve.mjs` never set `req.query` (plain node http), so `api/alerts.js`
(reading `req.query.bbox`) returned 400 where Vercel returns 200 — a
C6-class harness blind spot, exactly the mocked-route disease this lane
exists to kill. Fixed in `f144d01` (synthesize `req.query` from the URL).

## Gates

- vitest: 380/380 (incl. 9 new harness enumeration/reporting tests)
- tsc -b: clean; npm run build: clean
- ONE gated Playwright run: `REAL_API=1 scripts/e2e-gate.sh npx playwright
  test tests/qa.spec.ts` — see QA-REPORT.md latest run.

## Deviations

- `/p/<id>` swept against a post seeded node-side via the real API (the
  in-memory db resets per boot; seeding through the API keeps it mockless).
- Sweep signs in as `qa-bot` (localStorage session, same shape as
  real-api.spec.ts) because POST surfaces honestly 401 anonymous users —
  the pass proves a real user's button map, not an anonymous bot's.
- Click budget 60/route (spec runs 25) keeps multi-viewport runs bounded;
  `clicks` is printed per route so low counts stay visible.
- Phone keyboard pass: inline nav is CSS-hidden ≤480px (C1 design), so the
  keyboard-reachable header control is the hamburger; the drawer carries
  the nav links. Asserted through that path.
