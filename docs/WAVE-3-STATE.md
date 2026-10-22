# Wave 3 State Ledger (orchestrator)

Brief: `docs/WAVE-3-BRAINSTORM.md` · Heartbeat: `docs/HEARTBEAT-WAVE3.md`
Laws: deploy-once-at-wave-end · closeout sweep every lane · browser
serialization (e2e-gate.sh) · live-egress · commit author clodge123 ·
survival commit ≤15 min · branch push via REST (python3 /tmp/push_tree.py).

Tip at kickoff: `231ad9a` (wave-3 briefs merged). Current main tip: `65d298b`
(= remote `9af3ce7`).

## Round 1
| Lane | Branch | Status | Next step |
| --- | --- | --- | --- |
| W3-A1 weather-cache | r3w3/A1-cache @ c5c2977 | ✅ MERGED `83ea2c0` (185/185, live-egress 270ms, SWR+ring) | closed |
| W3-A3 map tint | r3w3/A3-tint @ b8cae3d | ✅ MERGED `6548a05` — .map-tint overlay, zoom-9 gate, ≤0.12 opacity; vitest 224/224, badges 6/6, determinism fix `3830caf` | closed |
| W3-B1 routing | r3w3/B1-routing @ af67dce | ✅ MERGED `24c43a8` — /t/<slug>, /t/<slug>/feed, /p/<id>, /alerts + gazetteer 404; vitest 207/207, Playwright 15/15 | closed |
| W3-C1 layout-shell | r3w3/C1-shell @ 571062c | ✅ MERGED `65d298b` — side panel (desktop dock / mobile sheet, P toggle), phone nav drawer, banner unmounted (refresher kept for dots); MapPage reconciled with A3 tint (kept) + banner removal (applied); Header reconciled with B1 (Link+computed aria-current kept, drawer added, drawer links aria-hidden when closed); vitest 232/232, shell+badges+polish+routing 39-test pass (phone drawer 44px law fixed: min-height 45px vs 43.99999 sub-pixel) | closed |
| W3-D1 feed-fix | r3w3/D1-feedfix @ 803f5d0 | ✅ MERGED `4d444ea` + flake fix `db2b775` — C6 404 class DEAD, real-api 6/6, smoke round-trip | closed |

## Round 2
| Lane | Status | Next step |
| --- | --- | --- |
| W3-A2 icons+fade-in | RUNNING (latest f93fdd5) | gates → push → merge |
| W3-D2 seeder+engagement | RUNNING (capture fix → re-seed → engagement) | verify → merge |
| W3-B2 town panel | RUNNING (B1 dep satisfied) | panel → gates → merge |
| W3-D3 post-detail+lightbox+share | RUNNING (B1+D1 deps satisfied) | /p/<id> page → gates → merge |
| W3-B3 click-to-detail | QUEUED behind B2 (MapPage serialization) | spawn when B2 merges |
| W3-B4 search+fly-to | QUEUED behind B2/B3 (MapPage serialization) | spawn when B3 merges |
| W3-C2 alert center | SPAWNED (C1 dep satisfied) | fill panel slot → gates → merge |
| W3-C3 command palette | QUEUED behind C2 (panel slot serialization) | spawn when C2 merges |

Round 3: E1 polish seeds · E2 tour · F QA harness. Wave 4 (polish pass): GAP
— after owner plays with wave 3.

## Host conditions (2026-10-22 ~05:55 CDT)
Post gateway-restart recovery holding: load low, exec anchors swept, zombie
Z-states harmless. Lanes batch exec calls; browser runs serialized through
e2e-gate.sh. NO deploys during the wave. Closeout sweeps per lane + hourly
heartbeat.

## Heartbeat checks
- 02:19 CDT — broker saturated; late-night NO_REPLY.
- 03:25 CDT — post-restart recovery confirmed; all 5 lanes resumed.
- 04:10 CDT — D1 merged (C6 dead, flake fixed); D2 spawned.
- 04:45 CDT — B1 merged (207/207, 15/15); B2+D3 spawned.
- 05:10 CDT — A3 merged (224/224, 6/6, determinism fix).
- 05:55 CDT — C1 merged (232/232, 39/40→39+1 fixed, phone drawer 45px); C2 spawned.

## Decisions carried
60-min in-memory server cache + SWR + neighbor prefetch · lucide icons
(theme-neutral) · tap-to-expand card · fly-to animation law (~1.5-2s) ·
square geometry kept (option C) · alert center replaces banner · engagement
seed ~3-8 reactions + 0-3 comments deterministic · flat comments ·
post detail full page · tour seen-once per visitor (localStorage + IP/userId).
