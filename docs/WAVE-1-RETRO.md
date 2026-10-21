# WAVE-1 RETRO (run 2) — close-out

Wave 1: 19:45–21:22 CDT, 7 parallel lanes, 36 commits, all merged to main
(`467ee02`). What broke, what caught it, what changes for wave 2.

## What broke

### 1. Base64 trees-API corruption (the big one)
Git transport is proxy-blocked on this host, so pushes go via GitHub REST API
(contents/trees/refs). The push path stored **base64-encoded text as the file
content** — the repo tree shipped with `package.json` (and other files) as
base64 blobs that node/npm/vite/esbuild cannot parse. Root package.json was
invalid JSON in-tree; npm install broke; bundlers choked.
**Caught by:** L2 (npm couldn't parse root package.json → isolated `.e2e/`
deps dir as a workaround) and L3 (npm install broke → decoded & fixed,
commit `de45f7e`). L2 also added valid-JSON shield `package.json` files in
subdirs so tooling never descends into the corrupt root.
**Wave 2 fix:** push path must decode before writing (write `content` as
plain text, not base64, per GitHub contents API semantics), plus a CI
`json-lint` gate that fails any tracked .json that isn't parseable. The
shield files stay until the push-path fix is proven.

### 2. Three lanes killed mid-run
Lanes died mid-session (fleet/host kills), including L4 theme and L5 map —
both had real work unmerged, no metrics file, no archived screenshots.
**Caught by:** orchestrator's lane-resume directive (owner intervention #2);
merge-time inspection found the orphaned lane commits (`608ac50`, `6b5fb99`,
`d5987a7`, L6 spec work) — rescued into integration merge `467ee02` rather
than re-run.
**Wave 2 fix:** (a) survival-commit cadence (≤10 min, then ≤15 min) is the
rescue net — it worked: every killed lane's code survived in commits;
(b) lanes must write their metrics file **at first survival commit**, not at
lane end, so a kill leaves an audit trail; (c) orchestrator adds a
lane-liveness heartbeat so kills are detected in minutes, not hours.

### 3. Map-context dual-seam
L6 needed the MapLibre map instance; L5 wasn't merged when L6 started. L6
defined its own `src/lib/map/map-context.tsx` seam (MapLibre-compatible
shape) locally. Two files of the same name existed on diverging branches —
a merge-time collision waiting to happen.
**Caught by:** integration merge `467ee02` — seams resolved deliberately,
L6's consumer re-pointed to L5's context; build + tsc + vitest green.
**Wave 2 fix:** shared seams (map context, theme API, seed contract) get a
**contract stub merged to main BEFORE lanes launch** (day-0 seam commit),
so lanes import the real file from the start instead of inventing parallel
shapes. SEED-CONTRACT.md proved this pattern works — extend it.

### 4. E2E proxy health-check hijack
Node 24's NODE_USE_ENV_PROXY made localhost health-checks route through the
authenticating egress proxy ("Host must match request authority" / 407), so
Playwright webServer probes and tile fetches failed against local servers;
port 4173 was also squatted by a foreign app on this host (vite preview
silently proxied to it).
**Caught by:** L2 (probe failure → NO_PROXY=127.0.0.1,localhost injected in
e2e-run.mjs + configs; dedicated port 43117 with reuseExistingServer:false;
port-probe on 43118) and L6 (same class → --no-proxy-server + port 4183).
**Wave 2 fix:** standardize on ONE harness port policy (L2's 43117 + probe)
and bake NO_PROXY into the shared e2e config every lane inherits — no
per-lane proxy archaeology.

## What worked (keep)

- **Gate ladder with teeth:** every one of the 15 catches above was caught
  by a gate, not by production. The console-collector negative selftest
  (L2) proves the Gate 1 collector actually fires.
- **Active-time-only accounting:** 263 active lane-minutes in a 97-minute
  wall-clock wave (2.7× parallelism) — honest numbers, gaps excluded.
- **Preflight gate honesty:** deploy-preflight correctly NO-GOs without
  POSTGRES_URL instead of faking a pass; 36/36 commits author-clean.
- **Sufficiency law:** "vitest pass is never sufficient" held — L4/L5's
  vitest-green code still needed browser proof, and the ledger marks their
  screenshot gaps honestly instead of closing them on unit tests.

## Process changes for wave 2 (action list)

1. Fix push path: decode content before trees-API write; add json-lint CI gate.
2. Day-0 seam contracts merged to main before lane launch (map context, theme, seed).
3. Lane metrics file written at first survival commit (≤10 min), not lane end.
4. Lane-liveness heartbeat in orchestrator; killed lanes auto-resume from branch tip.
5. One shared e2e config: NO_PROXY + fixed port + port probe, inherited by all lanes.
6. Gate 1 requires the archived screenshot as a merge artifact (CI runs the spec and commits the PNG) — closes the L4/L5-style "test exists, proof missing" gap.
7. Owner interventions: 2 this wave (base64 fix + lane-resume) — target ≤1.

## Article notes (LinkedIn series data points)

- 7 parallel agents, 263 active lane-minutes, 36 commits, 15 catches, 2 owner
  interventions, 3 lanes killed — zero production defects shipped.
- The run-1 lesson "ship untested" inverted: every defect died at a gate.
