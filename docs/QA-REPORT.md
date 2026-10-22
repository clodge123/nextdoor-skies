# QA Report — click-every-button pass (W3-F)

Harness: `scripts/qa-harness.mjs` (CLI) + `tests/qa.spec.ts` (CI Playwright).
Production-shaped law (C6): REAL_API=1 against `scripts/api-serve.mjs`
(built `dist/` + the ACTUAL `api/*.js` handlers, SPA rewrite mirroring
`vercel.json`). **Zero `page.route` mocks** — the mocked-route blind spot
that shipped the production 404 stays dead.

## How to run

```bash
# one-off sweep, all six routes, desktop viewport (builds first):
QA=1 scripts/e2e-gate.sh
# explicit CI form (same sweep + keyboard pass, phone/tablet/desktop):
QA=1 REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/qa.spec.ts
# dry-run against an already-built, already-served harness:
node scripts/qa-harness.mjs --base-url http://127.0.0.1:43118 --no-build
```

## Pass semantics (failures=0 law)

A route is **PASS** only when, across every click on every interactive
element it enumerates (`a[href]`, `button`, `input`, `textarea`, `select`,
`[role=button]`, `[contenteditable]`):

- console-errors = 0 (documented exclusions only: GL-driver chatter,
  third-party OpenFreeMap style-spec noise, tile-pyramid 404 chatter,
  favicon — never app code),
- api-failures = 0 (no `/api/*` response ≥ 400),
- pageerrors/unhandled rejections = 0.

`PASS(no-targets)` flags an enumeration gap (zero clickable elements found
on a route that must have them) and fails the lane gate. Any non-zero count
flips the route to FAIL with the offending lines printed.

## Latest run

- Date: 2026-10-22 (wave 3, round 3)
- Tip swept: `373984b` (branch r3w3/F-qa, includes all round-1/2 lanes merged)
- Command: `REAL_API=1 scripts/e2e-gate.sh npx playwright test tests/qa.spec.ts`
- Viewports: phone 390x844 + tablet 768x1024 + desktop 1280x800
- Result: **30/30 passed (13.0m)** — 6 click sweeps x 3 viewports + 4
  keyboard tests x 3 viewports
- Seed: real post created node-side via `POST /api/posts` (qa-bot session,
  Salina KS) so `/p/<id>` is a live deep link

Per-route click sweep (identical verdicts in all three viewports):

| route | label | clicks | console-errors | api-failures | pageerrors | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| / | map | ~25 (budget-capped) | 0 | 0 | 0 | PASS |
| /feed | feed | 11-16 | 0 | 0 | 0 | PASS |
| /t/salina-38.84--97.61 | town page | 3 | 0 | 0 | 0 | PASS |
| /t/salina-38.84--97.61/feed | town feed | 11-15 | 0 | 0 | 0 | PASS |
| /p/<seed-post> | post detail | 10-14 | 0 | 0 | 0 | PASS |
| /alerts | alerts page | 4-8 | 0 | 0 | 0 | PASS |

TOTAL: console-errors=0, api-failures=0, pageerrors=0,
failing-routes=0 → **PASS**

Keyboard spot pass (all viewports, per route): Tab order reaches header
controls (inline nav desktop/tablet; hamburger phone) and main content;
Enter activates (nav link navigates; phone: hamburger -> drawer -> link;
map zoom buttons fire on Enter); Ctrl+K palette opens and Escape closes
with focus returning to a real control — no keyboard traps observed.

## Deviations / notes

- Town slug `salina-38.84--97.61` is the canonical gazetteer seed (same as
  the B4 search spec) — deterministic, no positional guessing.
- `/p/<id>` is swept against a freshly seeded post (in-memory db resets per
  server boot); the seed request goes through the real API, not a mock.
- The sweep presses Escape between clicks to keep overlays (palette,
  lightbox, drawer, panel) from poisoning the next enumeration.
- Click budget 60/route keeps multi-viewport runs bounded; the table prints
  `clicks` so a suspiciously low count is visible.
