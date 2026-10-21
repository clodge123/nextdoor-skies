
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
