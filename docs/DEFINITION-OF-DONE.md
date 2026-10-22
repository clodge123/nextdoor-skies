# NEXTDOOR SKIES — RUN 2 — DEFINITION OF DONE v2

Status: DRAFT FOR OWNER SIGN-OFF. This document is the law for every lane,
every wave, every deploy. Run 1 shipped untested; this is the fix, in writing.

## The one-sentence law

**Nothing is "done" until a real browser has proven it works.** A vitest pass,
a tsc pass, a build pass, or a curl 200 is necessary but NEVER sufficient.

## Gate ladder (every level must pass to advance)

### Gate 0 — Lane code gate (per lane, automated, in CI)
- [ ] tsc, ESLint, production build exit 0
- [ ] vitest suite green (unit + component, jsdom)
- [ ] Determinism scan: zero Math.random / Date.now / new Date in render/logic
- [ ] Radius scan: zero border-radius (anti-slop law, var(--radius)=0px)
- [ ] No imports from crypto-weather-central
- [ ] Lane added/updated at least ONE Playwright test touching its feature

### Gate 1 — Lane browser gate (per lane, the run-1 missing gate)
- [ ] Playwright test executes the feature in a real Chromium page
- [ ] Asserts DOM/rendering (visible element/text), not just network status
- [ ] Zero console errors/warnings during the interaction
- [ ] Screenshot archived (desktop 1280×800) into docs/screenshots/<lane>/
- [ ] Runs in all three viewports: phone 390×844, tablet 768×1024, desktop
- [ ] Touch interactions verified on mobile viewport (tap, scroll, long-press)

### Gate 2 — Wave integration gate (per wave, after all lanes merge)
- [ ] Full CI green on main
- [ ] Integration Playwright suite: golden paths end-to-end
      (load home → zoom to town → read temp → open town feed → post →
      reply → react → flag → edit own post → delete → theme change)
- [ ] Every golden path passes in ALL THREE viewports
- [ ] Console-error budget: zero errors across the whole suite
- [ ] Visual review: screenshot set reviewed against design system
      (square geometry, tokens, honest states, 2-second first-glance test)

### Gate 3 — Deploy gate (per wave, the only deploy cadence)
**Deploy law (owner, 2026-10-21):** ALL testing happens LOCALLY — vitest,
tsc, build, Playwright gates run against the local server exactly as they
will behave deployed. A deploy is NEVER a testing step. No per-change
deploys, no per-fix deploys, no preview deploys to "see if it works".
One deploy per wave, as the LAST gate, solely to prove the deployed app
behaves identically to local at the real URL. Free-plan deploy quota is
finite; dozens of deploys burns the room.
- [ ] Deploy pipeline preflight passes: commit author valid, function count
      ≤12, env-var audit clean, migrations applied to production DB
- [ ] Wave deploys to production (wave-scoped, NOT per-merge, NOT per-fix)
- [ ] Production smoke in real browser (Playwright against live URL):
      pages 200 + renders + console clean + screenshots 3 viewports
- [ ] HANDS-ON browser session (OpenClaw browser tool): a human-style pass —
      mouse/keyboard clicking through the app, watching every screen.
      Screenshots + notes recorded. This is mandatory, not optional.
- [ ] SMOKE FIX LOOP: if smoke finds ANY defect: fix → redeploy → re-smoke.
      The wave does not close until a full clean smoke run. Max 3 loops
      before escalating to owner.

### Gate 4 — Wave close-out
- [ ] Requirements ledger: every wave R# has a proof line (screenshot/test/URL)
- [ ] Metrics rollup: active-time-only lane rows, gate counters, catches
- [ ] Retro doc: what broke, what caught it, process changes for next wave
- [ ] Article notes: data points for the LinkedIn series
- [ ] Owner steering window (between waves only)

## Testing inventory (run 2 — zero gaps)

| Surface | Unit | Component | Playwright | Hands-on browser |
|---------|------|-----------|------------|------------------|
| Map render/zoom/tiers | ✓ | ✓ | ✓ 3 viewports | ✓ per wave |
| Town badges + temps | ✓ | ✓ | ✓ | ✓ |
| Feed scroll + infinite | ✓ | ✓ | ✓ mobile-first | ✓ |
| Composer + auto map-image | ✓ | ✓ | ✓ post flow | ✓ |
| Comments (one level) | ✓ | ✓ | ✓ reply flow | ✓ |
| Reactions/flags/rate-limit | ✓ | ✓ | ✓ | ✓ |
| Alerts (server proxy) | ✓ | ✓ | ✓ no-403 check | ✓ |
| Radar layer | ✓ | ✓ | ✓ toggle | ✓ |
| Weather theme accent | ✓ | ✓ | ✓ mock-weather swap | ✓ |
| Responsive layout | — | ✓ | ✓ 3 viewports | ✓ resize check |
| API endpoints | ✓ | — | ✓ via UI | ✓ |

## Run-1 defect catalog → run-2 laws (never again)

1. Alert banner flicker (loading:true every poll) → last-data-wins law
2. Per-pan refetch storms (weather/alerts) → fetch-per-window law
3. Tile error sticks UI broken → tile-errors-are-warnings law
4. demotiles basemap (Crimea! no roads!) → production basemap law
5. Browser-blocked User-Agent → NWS server proxy law
6. Frozen countdown (no clock tick) → render-clocks get timers law
7. Canvas resize-every-frame churn → resize-on-change law
8. Deploy blockers discovered late → day-1 deploy pipeline lane
9. Commit-author invalid → author preflight gate
10. >12 functions Hobby cap → function-count gate
11. Requirements lost mid-flight → requirements ledger + close-out audit
12. "Tested" = jsdom only → Gate 1 browser law (the big one)

## Escalation / intervention policy

- Zero owner intervention during waves. Any defect found is fixed by the
  fleet, verified by the same gate that missed it, and recorded.
- Owner intervenes between waves only (steering/brainstorm windows).
- If a blocker needs owner action (e.g. GitHub app linking, account-level
  settings), it is flagged immediately with exact instructions.

## Metrics law (unchanged, extended)

- Wall-clock counts ACTIVE RUNNING TIME ONLY (fleet gaps excluded).
- New counters: browser-gate runs, defects caught per gate level,
  intervention count (target: 0), smoke-loop iterations.
