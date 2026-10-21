# Wave 2 Metrics Rollup — Run 2 (2026-10-21)

Active running time only (fleet-law accounting; gate-queue waits excluded).

| Lane | Active min | Highlights | Gate result |
| --- | --- | --- | --- |
| W1 WEATHER-PROXY | ~45* | /api/weather server proxy; fixes Open-Meteo batch 404 "awaiting feed" bug; live-egress caught °C/units trap | vitest 175/175 merged; live prod 200 |
| W2 NWS-ALERTS | ~60 | /api/alerts proxy; per-town zone cache forever; live-egress caught forecast-vs-county zone attribution defect | 79/79 lane tests; live ALL PASS |
| W3 IDENTITY | ~40 | session lib S1 + IdentityPicker + geolocation; XSS sanitization proven | 81/81 merged |
| W4 POSTS-API | ~55 | posts/comments/reactions/flags in 1 function; hot ranking; rate limit; 120KB snapshot cap | 19 API tests green |
| W5 FEED-UI | ~70 | hot-pinned + newest feed; optimistic reactions; canvas snapshots; identity gate | gated Playwright 18/18 |
| W6 POLISH | ~35 | nav CSS (owner-flagged), 44px targets, zoom-9 regression guard | gated spec 9/9 |
| W7 SEED | ~102 | 177 posts / 35 towns, 147 real canvas snapshots; CI shard fan-out beat IP rate limit | dry-run + live 177/177 |

\* reconstructed from survival-commit cadence (metrics files carry the detail).

**Totals:** ~410 active lane-minutes (~6.8 h) across 7 lanes; wall-clock span 11:05→14:55 CDT (~3.8 h), ~1.8× parallelism (browser runs serialized by design — that's the OOM fix working).

**Catches:** 4 production-adjacent defects caught by live-egress law (batch 404, units=imperial no-op, forecast-zone attribution, posts.js bundle-traceable gazetteer) + 2 owner field-test flags fixed (nav CSS, zoom-9 badge tier). 1 lane stalling intervention (W7 environment-probe loop → steering → 177/177).

**Gates (final tip `8ecdbe6`):** vitest 175/175 · tsc/build exit 0 · Playwright Gate 2 44/44 (phone/tablet/desktop) · production smoke 9/9, zero console errors. Production: https://nextdoor-skies-run2.vercel.app (Ready).

**Function budget:** 4 of 12 (probe, weather, alerts, posts).
