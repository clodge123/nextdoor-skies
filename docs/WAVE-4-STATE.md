# Wave 4 State Ledger (orchestrator)

Brief: `docs/WAVE-4-BRAINSTORM.md` (all 8 sessions DECIDED, moodboards
approved C-01/C-02/C-03) · Greenlight: owner 2026-10-22 23:24 CDT.
Laws: deploy-once-at-wave-end · closeout sweep every lane · browser
serialization (e2e-gate.sh) · live-egress · author clodge123 · survival
commit ≤15 min · REST push (python3 /tmp/push_tree.py) · smaller chunks
(12 lanes × 3 rounds) · neon-green terminal theme · square corners ·
honest states · fly-to law · ≥44px · determinism.

Tip at kickoff: `f08d33b` (wave-4 lane plan merged). Remote tip at spawn:
`c00a1ac759e0`.

## Round 1 — foundations (spawned 2026-10-22 23:26 CDT)
| Lane | Branch | Status | Next step |
| --- | --- | --- | --- |
| W4-A1 units-core | r4w4/A1-units @ 8b73fcd | ✅ MERGED `40b9d31` — units.ts + useUnits hook; badges/panel/tour F by default; vitest 417/417, tsc/build/determinism clean; remote tip `6f9aad1` | closed |
| W4-A2 unit-toggle | r4w4/A2-toggle @ d2a3de0 | ✅ MERGED `745dbc5` (remote `d94d7b5`) — F\|C pill (neon active, 46px box, square, keyboard/aria, drawer surface phone), units-toggle.ts seam; badge seam conflict resolved to A1 canonical useUnits/formatTemp (stopgap import dropped); vitest 431/431, gated units-toggle 3/3 | closed |
| W4-B1 badge-above-label | r4w4/B1-badge-pos | ▶️ spawned | bbox law badge.bottom ≤ label.top |
| W4-B2 zoom-match | r4w4/B2-zoom-match | ▶️ spawned | per-town label zoom from tiers.ts |
| W4-C1 fetch-hygiene | r4w4/C1-fetch @ f08d33b | ⚠️ RECON ONLY — lane session ended after read-only pass (no code/gates/push). Root cause + seams verified (TownPanel:78 fetchPosts no timeout/abort; alerts refresher lacks abort; feed apiJson seam clean). Locked plan recorded in lane report; follow-up dispatched to the kept child session | follow-up running |
| W4-D1 snapshot-compositor | r4w4/D1-compositor @ b27cf8d+9adf55a | ✅ MERGED `9ea02e9` (remote `d671a68`) — api/snapshot.js serverless 3×3 ne2sr tile stitch (16:9 640x360 JPEG q72, zero browser/canvas/cross-origin), variance gate >=16 (measured: Springfield 144, Seattle 1278, ocean 282 vs black ~0) + one refetch then loud 502 — NO fallbacks; GET /api/snapshots query-param + path-param twins (C6); posts.snapshotId wiring, snapshots table (bytea); FNV-1a ids, byte-identical determinism proven; vitest 450/450, tsc/build/determinism clean. Deviation: zoom clamp [1,6] (ne2sr pyramid tops at z6; raster bright endpoints 403 server-side — vector pbf rasterizing banned by method law). Contract for D2: docs/SNAPSHOT-API.md | closed |

Worktrees: `~/.openclaw/worktrees/r4/w4-<lane>` (node_modules + .e2e
symlinked). Merge each on completion report + merge-disease diff vs
previous main tip.

## Round 2 — features (spawn after round 1 merges)
W4-B3 de-cluster ✅ MERGED `1345a99` (remote `f783f2b`) — cluster.ts pure same-temp 96px-radius grouping (R17 id tie-break, NaN never merges), "Moore +N" badge below z9 composing after B2 gate, zoom-in/tap-fly-to expand (zero sticky state), cluster = real button ≥44px square; vitest 554/554. Merged via 3-way blob merge (lane branch base 631c84b, git transport dead on remote ref) · W4-C2 feed-load (prefetch/infinite scroll/
content-visibility) ✅ SPAWNED 07:35 @ 1345a99 (net.ts landed) · W4-D2 snapshot-overlay ✅ MERGED `3517f7f` (remote `0a34ff3`) — composer CAPTURE via /api/snapshot (zoom 11, server clamps z6), V1 bottom-bar burn-in client-side once at upload (town·time·°F·glyph, units-law, R17 epoch math), inline burned JPEG + snapshotId provenance, C-03 author/time BELOW image, loud 502/401 + RETRY/POST-WITHOUT-IMAGE; vitest 518/518, gated PW 6/6, burn variance 2720

burn-in, composer, author/time below image) ▶️ · W4-E1 all-feed (Hot|Latest
tabs, ?scope=, town chips) ▶️ · W4-E2 alerts-whole-row (whole-row fly-to)
✅ MERGED `09e6e5a` (remote `c3f132a`) — AlertRow = ONE fly-to button
(badge/headline/stamps/town inside), click/Enter/Space flies+expands, zero
nested controls (one Tab stop asserted), neon hover ring (computed
rgb(0,255,157)) + 44px (measured 64px), /alerts rows route ?panel= for fly
parity; vitest 467/467, gated Playwright 9/9. Deviation: ?alert= param
never existed on main (verified), real scheme ?panel= kept.

## Round 3 — polish + proof (spawn after round 2 merges)
W4-F1 tour-fixes ✅ MERGED (remote `8a2db93`) — step 1 copy "°F by default … units pill in the header" (copy-law test), placeBubble() pure seam (measure rect → below/flip-above/slide-beside → clamp 16px insets; mobile bottom→top dock flip) fixes desktop hides/too-high/too-low, replay seams intact, zero CSS changes; vitest 562/562, gated tour PW 7 pass/1 skip

owner: hides/too high/too low, not viewport-responsive) · W4-G1 qa-gates ▶️ SPAWNED 07:52 @ 988504a (5 wave-4 specs in ONE gated run, no-rounded-corners scan, neon-token audit)

(5 new specs + harness routes + no-rounded-corners scan + neon-token audit).

## Round 4 — closeout (orchestrator)
full-suite gate (host quiet) → merge-disease diff → ledger → single deploy
→ seed-wave3.yml run (owner setting NDS_ADMIN_SECRET; seed roster YES) →
owner demo.

## Host conditions (2026-10-22 23:25 CDT)
Healthy: load ~0.6, ports clean (moodboard strays killed), anchors swept.
Browser runs serialized through e2e-gate.sh. NO deploys during the wave
(round 4 owns the one deploy).

## Heartbeat checks
- 23:26 CDT — kickoff: 6 round-1 worktrees created from f08d33b, lanes
  spawned, ledger armed.

## Decisions carried
F default + header toggle (S1) · badge ABOVE label + zoom-match + cluster
badge (S1) · skeletons/timeout/abort/prefetch/infinite-scroll (S2) ·
serverless compositor, your-view capture, bottom strip, loud errors,
stored JPEGs (S7) · author/time BELOW image (C-03) · Hot|Latest tabs (S4) ·
whole-row alert fly-to (S5) · tour desktop fix (owner 23:11) · neon-green
(C-01) + square corners (C-02) · seed roster YES · Deployment Protection
stays ON.

## Heartbeat checks (cont.)
- 00:25 CDT — **A1 merged** (`40b9d31`, remote `6f9aad1`): vitest 417/417,
  tsc/build/determinism clean, merge-disease spot-check clean (MapTint,
  TownSearch, TownPanel, AlertCenter, palette blocks intact). C1 recon-only
  report reviewed — plan sound, implementation follow-up sent to the kept
  lane session. A2/B1/B2/D1 running.

## Heartbeat checks (cont.)
- 01:05 CDT — **A2 merged** (`745dbc5`, remote `d94d7b5`): merged-tree vitest
  431/431 (41 files), tsc clean. Conflict at TownBadges seam resolved to
  A1's canonical `useUnits`+`formatTemp` (A2's authorized stopgap hook
  dropped per lane's own migration note). B1/B2/D1 running; C1
  implementation follow-up running.

## Heartbeat checks (cont.)
- 02:15 CDT — **D1 merged** (`9ea02e9`, remote `d671a68`): merged-tree vitest
  450/450, tsc/build/determinism clean. Fix applied during merge: installed
  pngjs/jpeg-js into shared node_modules (declared in package.json, absent
  from the tree — lane ran in its own worktree install). B1/B2 running;
  C1 implementation follow-up running.

## Heartbeat checks (cont.)
- 02:55 CDT — **B1 + B2 merged** (`7ded72d`, `9f071d7`; remote `2bdf874`):
  merged-tree vitest 464/464 (43 files), tsc clean. B2 doc-comment conflict
  resolved keeping both laws (zoom-match gate + badge-above-label stacking).
  Round 1 status: A1 ✅ A2 ✅ B1 ✅ B2 ✅ D1 ✅ — C1 implementation follow-up
  running. Round 2 spawn (B3/C2/D2/E1/E2) waits on C1 landing (C2 builds on
  net.ts).

## Heartbeat checks (cont.)
- 02:58 CDT — **Round 2 spawned** (B3, D2, E1, E2 from `0615b69`). C2
  feed-load stays queued until C1's net.ts lands (builds on it). Round 1:
  A1/A2/B1/B2/D1 closed; C1 implementation follow-up running.

## Heartbeat checks (cont.)
- 03:35 CDT — **E2 merged** (`09e6e5a`, remote `c3f132a`): merged-tree vitest
  467/467 (43 files), tsc clean. B3/D2/E1 running; C2 queued behind C1.

## Heartbeat checks (cont.)
- 06:10 CDT — **E1 merged** (`f1f3641`, remote `6297ae4`): merged-tree vitest
  478/478 (44 files), tsc clean. Lane's first cut had a real scoping bug the
  e2e gate caught (session town forced for both tabs) — fixed per S4 law.
  Keyboard assertion cap fixed honestly (real DOM has 18 focusables before
  the tab; law asserted via DOM-order focusables, not weakened). B3/D2
  running; C1 implementation in flight; C2 queued behind C1.

burn-in, composer, author/time below image) ▶️ · W4-E1 all-feed (Hot|Latest
tabs, ?scope=, town chips) ▶️ · W4-E2 alerts-whole-row (whole-row fly-to)
✅ MERGED `09e6e5a` (remote `c3f132a`) — AlertRow = ONE fly-to button
(badge/headline/stamps/town inside), click/Enter/Space flies+expands, zero
nested controls (one Tab stop asserted), neon hover ring (computed
rgb(0,255,157)) + 44px (measured 64px), /alerts rows route ?panel= for fly
parity; vitest 467/467, gated Playwright 9/9. Deviation: ?alert= param
never existed on main (verified), real scheme ?panel= kept.

## Round 3 — polish + proof (spawn after round 2 merges)
W4-F1 tour-fixes (step 1 copy °F+toggle; desktop spotlight placement —
owner: hides/too high/too low, not viewport-responsive) · W4-G1 qa-gates
(5 new specs + harness routes + no-rounded-corners scan + neon-token audit).

## Round 4 — closeout (orchestrator)
full-suite gate (host quiet) → merge-disease diff → ledger → single deploy
→ seed-wave3.yml run (owner setting NDS_ADMIN_SECRET; seed roster YES) →
owner demo.

## Host conditions (2026-10-22 23:25 CDT)
Healthy: load ~0.6, ports clean (moodboard strays killed), anchors swept.
Browser runs serialized through e2e-gate.sh. NO deploys during the wave
(round 4 owns the one deploy).

## Heartbeat checks
- 23:26 CDT — kickoff: 6 round-1 worktrees created from f08d33b, lanes
  spawned, ledger armed.

## Decisions carried
F default + header toggle (S1) · badge ABOVE label + zoom-match + cluster
badge (S1) · skeletons/timeout/abort/prefetch/infinite-scroll (S2) ·
serverless compositor, your-view capture, bottom strip, loud errors,
stored JPEGs (S7) · author/time BELOW image (C-03) · Hot|Latest tabs (S4) ·
whole-row alert fly-to (S5) · tour desktop fix (owner 23:11) · neon-green
(C-01) + square corners (C-02) · seed roster YES · Deployment Protection
stays ON.

## Heartbeat checks (cont.)
- 00:25 CDT — **A1 merged** (`40b9d31`, remote `6f9aad1`): vitest 417/417,
  tsc/build/determinism clean, merge-disease spot-check clean (MapTint,
  TownSearch, TownPanel, AlertCenter, palette blocks intact). C1 recon-only
  report reviewed — plan sound, implementation follow-up sent to the kept
  lane session. A2/B1/B2/D1 running.

## Heartbeat checks (cont.)
- 01:05 CDT — **A2 merged** (`745dbc5`, remote `d94d7b5`): merged-tree vitest
  431/431 (41 files), tsc clean. Conflict at TownBadges seam resolved to
  A1's canonical `useUnits`+`formatTemp` (A2's authorized stopgap hook
  dropped per lane's own migration note). B1/B2/D1 running; C1
  implementation follow-up running.

## Heartbeat checks (cont.)
- 02:15 CDT — **D1 merged** (`9ea02e9`, remote `d671a68`): merged-tree vitest
  450/450, tsc/build/determinism clean. Fix applied during merge: installed
  pngjs/jpeg-js into shared node_modules (declared in package.json, absent
  from the tree — lane ran in its own worktree install). B1/B2 running;
  C1 implementation follow-up running.

## Heartbeat checks (cont.)
- 02:55 CDT — **B1 + B2 merged** (`7ded72d`, `9f071d7`; remote `2bdf874`):
  merged-tree vitest 464/464 (43 files), tsc clean. B2 doc-comment conflict
  resolved keeping both laws (zoom-match gate + badge-above-label stacking).
  Round 1 status: A1 ✅ A2 ✅ B1 ✅ B2 ✅ D1 ✅ — C1 implementation follow-up
  running. Round 2 spawn (B3/C2/D2/E1/E2) waits on C1 landing (C2 builds on
  net.ts).

## Heartbeat checks (cont.)
- 02:58 CDT — **Round 2 spawned** (B3, D2, E1, E2 from `0615b69`). C2
  feed-load stays queued until C1's net.ts lands (builds on it). Round 1:
  A1/A2/B1/B2/D1 closed; C1 implementation follow-up running.

## Heartbeat checks (cont.)
- 03:35 CDT — **E2 merged** (`09e6e5a`, remote `c3f132a`): merged-tree vitest
  467/467 (43 files), tsc clean. B3/D2/E1 running; C2 queued behind C1.

## Heartbeat checks (cont.)
- 06:10 CDT — **E1 merged** (`f1f3641`, remote `6297ae4`): merged-tree vitest
  478/478 (44 files), tsc clean. Lane's first cut had a real scoping bug the
  e2e gate caught (session town forced for both tabs) — fixed per S4 law.
  Keyboard assertion cap fixed honestly (real DOM has 18 focusables before
  the tab; law asserted via DOM-order focusables, not weakened). B3/D2
  running; C1 implementation in flight; C2 queued behind C1.

## Heartbeat checks (cont.)
- 06:55 CDT — **D2 merged** (`3517f7f`, remote `0a34ff3`): merged-tree vitest
  518/518 (47 files), tsc/build/check:all clean. Burn-in is client-side at
  upload (assigned by D1's contract deviation) — deterministic. Round 2:
  E2 ✅ E1 ✅ D2 ✅; B3 running; C2 queued behind C1 (11 commits, in
  timeout-fixture tuning).

## Heartbeat checks (cont.)
- 07:40 CDT — **C1 merged** (`7377848`+fix, remote `2a5bd6b`): net.ts timeout/
  retry/abort-supersede, Skeleton shimmer, cached-first SWR, honest error card.
  FeedPage/feed.ts resolved to E1 tabs + town-optional global stream; merge-
  disease check caught LOST D2 snapshot fields (snapshotId/lat/lon/zoom) in
  the C1-base resolution — restored (`vitest 525/525`). **B3 merged**
  (`1345a99`, remote `f783f2b`) via 3-way blob merge (lane's REST branch
  unfetchable over git transport; files pulled via GitHub blobs API, merged
  clean, gates 554/554). **C2 spawned** from `1345a99` — round 2 now 6/6
  active/closed. Round 3 (F1/G1) queues behind C2.

## Heartbeat checks (cont.)
- 07:52 CDT — **Round 3 spawned** (F1 tour-fixes, G1 qa-gates from `988504a`).
  Batch-settle reviewed: round-1/2 lane reports (A1/A2/C1-recon/B3/D2/E1/E2)
  all match merged state — nothing owed. Stale wave-1 L4/L5/L8/L11 delivery
  records ignored (closed runs, months old). B3's closeout sweep reaped
  166 fleet-wide zombie chrome-headless + 105 stale anchors — host clean.
  Round 2: C2 running. Round 3: F1/G1 running.

## Heartbeat checks (cont.)
- 08:50 CDT — **F1 merged** (remote `8a2db93`): lane report reconciles with
  merged state (placeBubble seam, °F copy, replay intact). Root cause of the
  owner's desktop complaint: fixed 150px bubble reservation, never clamped.
  Round 3: F1 ✅ · G1 running. Round 2: C2 running.
