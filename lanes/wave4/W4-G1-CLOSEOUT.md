# W4-G1 qa-gates — CLOSEOUT (wave 4, round 3)

Branch `r4w4/G1-qa-gates`, base main tip `988504a`. Lane: consolidate the
wave-4 QA surface into ONE gated run.

## Deliverables

### 1. Five wave-4 specs verified (one gated run)
Canonical invocation (added to scripts/e2e-gate.sh as `WAVE4=1`):

```
WAVE4=1 scripts/e2e-gate.sh
```

which expands to (REAL_API=1 exported by the gate target; api-serve serves
dist + real api handlers, NDS_API_DELAY/__delay seam intact):

```
npx playwright test --project=desktop \
  tests/units.spec.ts tests/badge-label-bbox.spec.ts tests/loading.spec.ts \
  tests/snapshot-overlay.spec.ts tests/snapshot.spec.ts tests/feed-all.spec.ts
```

- **units.spec.ts** — matrix completion ADDED (no weakening): new case
  "toggle persists: C survives reload via nds-units; cleared storage returns
  to F" (session-6 law 1's persistence + private-mode-honesty legs).
- **badge-label-bbox.spec.ts** — acceptance matrix FIXED to follow the
  merged B2 zoom-match law (see Deviations).
- **loading.spec.ts** — 3 C1 cases green; matrix note added honestly:
  infinite-scroll page-2 + content-visibility legs belong to W4-C2 (running
  on its own branch; verified absent in this tree by grep) — NOT stubbed.
- **snapshot**: tests/snapshot-compositor.test.ts (vitest math, 450-in-suite)
  + tests/snapshot-overlay.spec.ts (real-API composer gate) +
  tests/snapshot.spec.ts (POST/GET round-trip) — all green in the run.
- **feed-all.spec.ts** — 4 cases green (after the CSS restore below).

### 2. Scans (both pass on the full tree)
- **No-rounded-corners**: scripts/check-radius.mjs already scans all
  src/**.{css,ts,tsx} for border-radius outside var(--radius) — extended
  coverage was already in place; `radius scan OK (94 files)`.
- **Neon-token audit**: scripts/check-neon-tokens.mjs ADDED — fails on any
  hardcoded neon (#00ff9d / rgb(0,255,157)) in src/**.css outside the
  sanctioned `--accent:` token definition; every accent use must be
  var(--current-accent)/var(--accent). Passes (64 var() uses, 1 token def).

### 3. Gates
- vitest 554/554 (49 files) — clean (run on merged tree).
- tsc -b — clean. vite build — clean (runs inside the gate webServer).
- ONE gated run: 13/13 desktop tests green (final run, see below).

## Deviations (honest)

1. **Merge-disease found + fixed (main tip)**: the B3 merge (`1345a99`)
   dropped the W4-E1 CSS blocks `.feed-tabs` / `.feed-tab` / `.feed-town-chip`
   from src/index.css (E1 shipped them in `ec071d0`; selector diff proves
   loss). Result on main: Hot|Latest tabs rendered 21px tall (unstyled) and
   feed-all's 44px R13 assertion FAILED on the merged tree. Restored the
   three blocks verbatim from ec071d0 (with provenance comments).
2. **badge-label-bbox z8 expectation was stale**: written pre-B2 ("no
   badges below z9, vacuous"). Under the merged zoom-match tier bands
   (city z7-9), city-tier badges DO render at z8 — the spec failed its
   `toHaveCount(0)`. Fixed to assert the BINDING law (zero bbox overlaps
   at z8) plus a real named pair (Salina label visible at z8). The z10/12
   "Salina label visible" check was also stale (Salina is city-tier; its
   label leaves the surface above z9 under B2) — replaced with an in-view
   town-tier label name check. No assertion weakened.
3. **loading console collector**: the timeout case legitimately logs
   `Failed to load resource ... 502` from relayed openfreemap tile fetches
   (documented badge-label/smoke-prod law); loading.spec.ts collector now
   applies the same documented exclusion. App-origin output stays empty.
4. **C2/F1 gaps**: loading.spec.ts page-2/content-visibility legs await
   W4-C2 (running). No stubs written. F1 tour not touched.

## Gate run record

- Run 1: 10/13 — failures: badge z8 (stale vacuous expectation), feed-all
  44px (CSS merge-disease), loading timeout (console 502 relay noise).
- Run 2: 12/13 — CSS restore + collector fix green; badge z10 Salina label
  (stale B2 expectation).
- Run 3: 12/13 — z10 `.town-badge` first-visibility flaky (centering on
  Salina: city-tier, so town-tier badges in-window were luck-of-the-view).
- Run 4 (final): **13/13 GREEN in one gated invocation** (`GATE_EXIT=0`,
  1.9m) after centering z10/z12 on the town-tier sample Cross Lanes
  (-81.7907, 38.4204) that zoom-match.spec.ts probes deterministically.

## Commits (branch r4w4/G1-qa-gates)

1. `0b70086` neon-token audit scan (C-01)
2. `d11abe2` WAVE4=1 gate target; units persistence case; loading C2-gap note
3. `6e91e40` restore E1 CSS blocks; badge z8 zoom-match law; loading collector law
4. `a1483e7` badge z8/z10 follow merged B2 tier bands
5. `40e75b9` badge z10/z12 center on town-tier sample (deterministic)
6. closeout doc

Push: REST pattern. urllib transport (/tmp/push_branch_e1.py mechanism)
died repeatedly at the large tree-POST (proxy drops the connection);
succeeded via the gh-CLI REST variant (/tmp/push_branch_gh.py, per-call
retry/backoff, JSON `force:true` ref patch). Branch ref `r4w4/G1-qa-gates`
verified on remote = `64a9493` (tree contains all lane files; parent =
remote main tip `8a2db93` = F1 merged).

## Closeout sweep

- No LIVE leftover chrome-headless / api-serve / vite-preview children
  (pgrep clean after each gated run; the gate's flock holder exits with the
  run). Residual `[chrome-headless] <defunct>` ZOMBIES remain parented to
  OpenClaw service-child-group-anchor supervisors (reaped when those exit);
  zero RSS/CPU, no live browsers — fleet OOM law satisfied. No lane-owned
  processes left running.
- No deploys, no main-tree edits, no FeedPage/api/tour touches.
- vitest 554/554, tsc -b clean, vite build clean, both scans pass.
