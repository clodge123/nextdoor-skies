
## Run 2, Wave 1 — COMPLETE (2026-10-21)

- **Gate 2**: Playwright 27/27 (phone+tablet+desktop), vitest 56/56, tsc/build exit 0.
- **Deploy**: production live `https://nextdoor-skies-run2.vercel.app` (Ready, 35s build).
  - Deploy blockers fixed: base64-text tree corruption (git/trees needs raw content + blob API), stray pnpm-lock/pnpm-workspace (Vercel chose pnpm -> install died), SPA rewrite for client routes, ThemeToggle mounted in header.
- **Gate 3**: `npm run smoke:prod` 9/9 — map canvas + zoomed town labels (Manor TX), theme toggle flips bg, honest /feed, zero app console errors, 3 viewports. Evidence: `docs/screenshots/prod-smoke/` + `smoke-result.json`.
- Remote: `clodge123/nextdoor-skies` main tip = latest; Vercel auto-deploys on push.
- Next: wave 2 (feed, posts+map snapshots, auth-lite, NWS proxy, mobile parity).

## Owner field-test findings (2026-10-21, post wave 1)

1. **Badges show "awaiting feed" — REAL BUG, wave-2 fix.** Production console:
   `POST https://api.open-meteo.com/v1/batch` → **404** on every call. Verified:
   the batch endpoint path used by L6 (`api.open-meteo.com/v1/batch`) does not
   exist (Open-Meteo's batch API lives on `batch.api.open-meteo.com`, which
   this host's proxy can't resolve). The per-town `v1/forecast` endpoint works
   fine (200 + real data). L6 unit tests pass because they mock fetch — the
   classic "tested ≠ wired to reality" gap. Fix: server-side weather proxy
   (same pattern as the wave-2 NWS proxy), one batch call per window server-side.
   Badge UI itself is correct: honest "awaiting feed" state, no fake data (law #1).
2. **Nav bar has no CSS** — header renders (Map/Feed/toggle work) unstyled/tiny.
   Cosmetic; wave-2 polish lane (CSS pass over header + mobile layout).
3. **Feed page "Awaiting feed — wave 2"** — BY DESIGN, wave-1 placeholder.
4. **Console noise (not app bugs):** maplibre style-spec "found null" =
   third-party OpenFreeMap style expressions (documented exclusion); glyph
   range 404s = OpenFreeMap font pyramid, rendered locally; `tenantID` errors =
   owner's browser extension, not our code.

## Run 2, Wave 2 — COMPLETE (2026-10-21)

- **All 7 lanes merged** (W1 weather proxy, W2 alerts, W3 identity, W4 posts API,
  W5 feed UI, W6 polish, W7 seed). Tip `8ecdbe6`.
- **Fixes the owner field-test bug**: badge temps via `/api/weather` server proxy
  (Open-Meteo batch 404 root cause); zoom-9 badge rule (names-only below, no
  "awaiting feed" wall); nav bar CSS (owner-flagged unstyled header).
- **Live features**: per-town feed (hot-pinned + newest), posts with canvas
  map-snapshot images (data URL, zero storage), one-level replies, reactions
  (👍❤️😂), flag-to-hide, nickname+town-picker identity (geolocation→search),
  NWS alert banner + badge dots, 5/hr IP rate limit.
- **Seed**: 177 posts / 35 towns, 147 real canvas snapshots (CI shard fan-out
  beat the IP rate limit).
- **Gates**: vitest 175/175 · tsc/build exit 0 · Playwright 44/44 (3 viewports)
  · production smoke 9/9, zero console errors. Production Ready:
  https://nextdoor-skies-run2.vercel.app (4 of 12 functions used).
- **Laws proven**: live-egress law caught 4 production-adjacent defects that
  mocked tests missed (batch 404, units no-op, forecast-zone attribution,
  bundle-traceability). Browser traffic law: zero OOM events, 1 gate slot.
- Metrics: docs/metrics/WAVE-2-METRICS.md (~410 active lane-minutes, 7 lanes).

### Post-wave-2 integration fix (2026-10-21 evening)
- Closed the S6 seam: AlertBanner + badge alert-dots were exported, not
  mounted. MapPage now mounts the banner via useAlerts (one refresher/window
  feeds banner + dots through alertDotForTown). CSS, unit tests (2), gated
  spec assertions added.
- Aligned wave-2 stragglers in specs: polish.spec stubs the /api/weather
  proxy (old batch URL retired) + centers on Salina; feed identity test uses
  the combobox town-pick flow.
- Gates on tip d8e9cec: vitest 177/177 · tsc/build 0 · Playwright 45/45
  (3 viewports) · production smoke 9/9 failures=0. Production Ready with
  live NWS alerts (Austin air-quality alert visible in prod payload).
