
## Run 2, Wave 1 — COMPLETE (2026-10-21)

- **Gate 2**: Playwright 27/27 (phone+tablet+desktop), vitest 56/56, tsc/build exit 0.
- **Deploy**: production live `https://nextdoor-skies-run2.vercel.app` (Ready, 35s build).
  - Deploy blockers fixed: base64-text tree corruption (git/trees needs raw content + blob API), stray pnpm-lock/pnpm-workspace (Vercel chose pnpm -> install died), SPA rewrite for client routes, ThemeToggle mounted in header.
- **Gate 3**: `npm run smoke:prod` 9/9 — map canvas + zoomed town labels (Manor TX), theme toggle flips bg, honest /feed, zero app console errors, 3 viewports. Evidence: `docs/screenshots/prod-smoke/` + `smoke-result.json`.
- Remote: `clodge123/nextdoor-skies` main tip = latest; Vercel auto-deploys on push.
- Next: wave 2 (feed, posts+map snapshots, auth-lite, NWS proxy, mobile parity).
